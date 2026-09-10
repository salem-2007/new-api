package controller

import (
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

const selfAvatarMaxBytes = 4 << 20 // 4MB

func selfAvatarDir() string {
	return filepath.Join(filepath.Dir(common.SQLitePath), "user-avatars")
}

// UploadSelfAvatar accepts a local image upload from the current user, stores
// it under <data>/user-avatars, and updates the user's avatar_url to the
// hosted path (/user-avatars/<file>).
func UploadSelfAvatar(c *gin.Context) {
	id := c.GetInt("id")
	fileHeader, err := c.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "缺少文件")
		return
	}
	if fileHeader.Size > selfAvatarMaxBytes {
		common.ApiErrorMsg(c, "图片不能超过 4MB")
		return
	}
	ext := strings.ToLower(filepath.Ext(fileHeader.Filename))
	switch ext {
	case ".jpg", ".jpeg", ".png", ".webp":
	default:
		common.ApiErrorMsg(c, "仅支持 jpg/png/webp")
		return
	}
	f, err := fileHeader.Open()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	defer f.Close()
	cfg, _, err := image.DecodeConfig(io.LimitReader(f, 1<<20))
	if err != nil || cfg.Width <= 0 {
		common.ApiErrorMsg(c, "文件不是有效图片")
		return
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		common.ApiError(c, err)
		return
	}

	dir := selfAvatarDir()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		common.ApiError(c, err)
		return
	}
	name := fmt.Sprintf("u%d-%d%s", id, time.Now().Unix(), ext)
	target := filepath.Join(dir, name)
	saved, err := os.Create(target)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	defer saved.Close()
	if _, err := io.Copy(saved, f); err != nil {
		common.ApiError(c, err)
		return
	}

	urlPath := "/user-avatars/" + name
	if err := model.DB.Model(&model.User{}).Where("id = ?", id).Update("avatar_url", urlPath).Error; err != nil {
		common.ApiError(c, err)
		return
	}
	user, err := model.GetUserById(id, false)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	buildAvatarResponse(c, user, "头像已更新")
}

// GetSelfAvatarFile serves uploaded avatar images (public, path-sanitized).
func GetSelfAvatarFile(c *gin.Context) {
	name := c.Param("name")
	if strings.Contains(name, "..") || strings.Contains(name, "/") {
		c.Status(http.StatusNotFound)
		return
	}
	c.File(filepath.Join(selfAvatarDir(), name))
}
