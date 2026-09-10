package controller

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const githubUserAPI = "https://api.github.com/user/%s"

type githubPublicUser struct {
	Login      string `json:"login"`
	AvatarURL  string `json:"avatar_url"`
	Name       string `json:"name"`
	APIURL     string `json:"url"`
	HTMLURL    string `json:"html_url"`
	Type       string `json:"type"`
	ID         int64  `json:"id"`
	CreatedAt  string `json:"created_at"`
	UpdatedAt  string `json:"updated_at"`
	PublicGists int   `json:"public_gists"`
	PublicRepos int   `json:"public_repos"`
}

func fetchGitHubAvatarByAPI(githubID string) (string, error) {
	if githubID == "" {
		return "", errors.New("account is not linked to GitHub")
	}
	req, err := http.NewRequest(http.MethodGet, fmt.Sprintf(githubUserAPI, githubID), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	if common.GitHubClientId != "" && common.GitHubClientSecret != "" {
		req.SetBasicAuth(common.GitHubClientId, common.GitHubClientSecret)
	}
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", fmt.Errorf("github api returned %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var gu githubPublicUser
	if err := json.NewDecoder(resp.Body).Decode(&gu); err != nil {
		return "", err
	}
	if gu.AvatarURL == "" {
		return "", errors.New("github returned an empty avatar url")
	}
	return gu.AvatarURL, nil
}

func buildAvatarResponse(c *gin.Context, user *model.User, message string) {
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": message,
		"data":    buildSelfUserData(user),
	})
}

// UpdateSelfAvatar updates the avatar URL of the current user.
func UpdateSelfAvatar(c *gin.Context) {
	var request struct {
		URL string `json:"url"`
	}
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		common.ApiError(c, err)
		return
	}
	url := strings.TrimSpace(request.URL)
	if url == "" {
		common.ApiError(c, errors.New("avatar url is required"))
		return
	}
	if len(url) > 512 || !(strings.HasPrefix(url, "https://") || strings.HasPrefix(url, "http://")) {
		common.ApiError(c, errors.New("invalid avatar url"))
		return
	}
	id := c.GetInt("id")
	user, err := model.GetUserById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.DB.Model(&model.User{}).Where("id = ?", id).Update("avatar_url", url).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	user.AvatarURL = url
	buildAvatarResponse(c, user, "头像已更新")
}

// RefreshSelfAvatar re-syncs the avatar from the linked GitHub account.
func RefreshSelfAvatar(c *gin.Context) {
	id := c.GetInt("id")
	user, err := model.GetUserById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	avatarURL, err := fetchGitHubAvatarByAPI(user.GitHubId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if avatarURL != user.AvatarURL {
		if err := model.DB.Model(&model.User{}).Where("id = ?", id).Update("avatar_url", avatarURL).Error; err != nil {
			common.ApiError(c, err)
			return
		}
	}
	user.AvatarURL = avatarURL
	buildAvatarResponse(c, user, "已从 GitHub 同步最新头像")
}

// UnbindSelfGitHub removes the GitHub binding of the current user.
func UnbindSelfGitHub(c *gin.Context) {
	id := c.GetInt("id")
	user, err := model.GetUserById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if user.GitHubId == "" {
		common.ApiError(c, errors.New("account is not linked to GitHub"))
		return
	}
	// 防御: 没设密码且无其他登录方式的账号解绑后将无法登录
	if user.Password == "" {
		common.ApiError(c, errors.New("请先设置密码后再解绑 GitHub, 否则将无法登录"))
		return
	}
	if err := model.DB.Model(&model.User{}).Where("id = ?", id).Updates(map[string]interface{}{
		"github_id":  "",
		"avatar_url": "",
	}).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	user.GitHubId = ""
	user.AvatarURL = ""
	buildAvatarResponse(c, user, "已解绑 GitHub")
}
