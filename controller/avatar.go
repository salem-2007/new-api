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

// 支持解绑的内置 OAuth 渠道及对应的 users 表列
var unbindableProviders = map[string]string{
	"github":   "github_id",
	"discord":  "discord_id",
	"oidc":     "oidc_id",
	"wechat":   "wechat_id",
	"telegram": "telegram_id",
	"linuxdo":  "linux_do_id",
}

type bindingStatus struct {
	Provider string `json:"provider"`
	Bound    bool   `json:"bound"`
}


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

func countBoundProviders(user *model.User) int {
	n := 0
	for _, col := range unbindableProviders {
		switch col {
		case "github_id":
			if user.GitHubId != "" {
				n++
			}
		case "discord_id":
			if user.DiscordId != "" {
				n++
			}
		case "oidc_id":
			if user.OidcId != "" {
				n++
			}
		case "wechat_id":
			if user.WeChatId != "" {
				n++
			}
		case "telegram_id":
			if user.TelegramId != "" {
				n++
			}
		case "linux_do_id":
			if user.LinuxDOId != "" {
				n++
			}
		}
	}
	return n
}

// GetSelfBindings returns the binding status of every supported OAuth provider.
func GetSelfBindings(c *gin.Context) {
	id := c.GetInt("id")
	user, err := model.GetUserById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	bindings := make([]bindingStatus, 0, len(unbindableProviders))
	for provider := range unbindableProviders {
		bound := false
		switch unbindableProviders[provider] {
		case "github_id":
			bound = user.GitHubId != ""
		case "discord_id":
			bound = user.DiscordId != ""
		case "oidc_id":
			bound = user.OidcId != ""
		case "wechat_id":
			bound = user.WeChatId != ""
		case "telegram_id":
			bound = user.TelegramId != ""
		case "linux_do_id":
			bound = user.LinuxDOId != ""
		}
		bindings = append(bindings, bindingStatus{Provider: provider, Bound: bound})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": bindings})
}

// UnbindSelfProvider removes the binding of the given OAuth provider for the
// current user. Refuses when doing so would leave the account without any
// sign-in method (no password and no remaining binding).
func UnbindSelfProvider(c *gin.Context) {
	provider := strings.ToLower(strings.TrimSpace(c.Param("provider")))
	column, ok := unbindableProviders[provider]
	if !ok {
		common.ApiErrorMsg(c, "不支持的登录渠道")
		return
	}
	id := c.GetInt("id")
	user, err := model.GetUserById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if countBoundProviders(user) == 0 {
		common.ApiErrorMsg(c, "该账号没有绑定任何登录渠道")
		return
	}
	// 解绑后必须仍保留至少一种登录方式
	remaining := countBoundProviders(user) - 1
	if user.Password == "" && remaining == 0 {
		common.ApiErrorMsg(c, "解绑后将无法登录：请先设置密码或绑定其他渠道")
		return
	}
	if err := model.DB.Model(&model.User{}).Where("id = ?", id).Update(column, "").Error; err != nil {
		common.ApiError(c, err)
		return
	}
	switch column {
	case "github_id":
		user.GitHubId = ""
		if strings.Contains(user.AvatarURL, "avatars.githubusercontent.com") {
			_ = model.DB.Model(&model.User{}).Where("id = ?", id).Update("avatar_url", "").Error
			user.AvatarURL = ""
		}
	case "discord_id":
		user.DiscordId = ""
	case "oidc_id":
		user.OidcId = ""
	case "wechat_id":
		user.WeChatId = ""
	case "telegram_id":
		user.TelegramId = ""
	case "linux_do_id":
		user.LinuxDOId = ""
	}
	recordUserSecurityAudit(c, id, "user.binding_unbind", map[string]interface{}{
		"provider": provider, "success": true,
	})
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("已解绑 %s", provider),
		"data":    buildSelfUserData(user),
	})
}

// fetchProviderAvatar tries to fetch the latest avatar for the user from any
// provider that supports public avatar lookup. Currently only GitHub exposes a
// public, tokenless API keyed by numeric id.
func fetchProviderAvatar(user *model.User) (string, string, error) {
	if user.GitHubId != "" {
		url, err := fetchGitHubAvatarByAPI(user.GitHubId)
		if err == nil {
			return url, "github", nil
		}
	}
	return "", "", errors.New("当前登录渠道不支持自动同步头像, 请重新通过该渠道登录以更新头像, 或手动填写头像 URL")
}

// RefreshSelfAvatarSync syncs the avatar from the currently bound provider.
func RefreshSelfAvatarSync(c *gin.Context) {
	id := c.GetInt("id")
	user, err := model.GetUserById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if countBoundProviders(user) == 0 {
		common.ApiErrorMsg(c, "当前账号使用密码/邮箱登录, 请在下方手动填写头像 URL")
		return
	}
	avatarURL, provider, err := fetchProviderAvatar(user)
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
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("已从 %s 同步最新头像", provider),
		"data":    buildSelfUserData(user),
	})
}

var _ = time.Second // keep time import if unused later
