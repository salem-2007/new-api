package controller

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// 管理员上传的液态玻璃壁纸，存储于 <data_dir>/glass-wallpapers/<day|night>/
// 通过 /glass-wallpapers/<scope>/<file> 静态对外提供（web-router 注册）。

const glassWallpaperMaxBytes = 8 << 20 // 8MB

func glassWallpaperDir(scope string) string {
	return filepath.Join("glass-wallpapers", scope)
}

// GlassWallpaperEntry 壁纸清单条目（公开给所有登录用户）
type GlassWallpaperEntry struct {
	Name string `json:"name"`
	URL  string `json:"url"`
	Scope string `json:"scope"`
	Size int64  `json:"size"`
}

func randomSuffix() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// UploadGlassWallpaper 管理员上传壁纸（scope: day|night）
func UploadGlassWallpaper(c *gin.Context) {
	scope := c.PostForm("scope")
	if scope != "day" && scope != "night" {
		common.ApiErrorMsg(c, "scope 必须为 day 或 night")
		return
	}
	file, err := c.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "缺少文件")
		return
	}
	if file.Size > glassWallpaperMaxBytes {
		common.ApiErrorMsg(c, "壁纸不能超过 8MB")
		return
	}
	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
		common.ApiErrorMsg(c, "仅支持 jpg/png/webp")
		return
	}

	f, err := file.Open()
	if err != nil {
		common.ApiErrorMsg(c, "读取文件失败")
		return
	}
	defer f.Close()

	// 校验是真实图片（防伪装扩展名）
	cfg, _, err := image.DecodeConfig(io.LimitReader(f, 1<<20))
	if err != nil || cfg.Width <= 0 || cfg.Height <= 0 {
		common.ApiErrorMsg(c, "文件不是有效图片")
		return
	}
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		common.ApiErrorMsg(c, "读取文件失败")
		return
	}

	dir := glassWallpaperDir(scope)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		common.ApiErrorMsg(c, "创建目录失败")
		return
	}

	base := strings.TrimSuffix(filepath.Base(file.Filename), ext)
	base = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return '-'
	}, base)
	if base == "" || base == "-" {
		base = "wallpaper"
	}
	name := fmt.Sprintf("%s-%s%s", base, randomSuffix(), ext)

	out, err := os.Create(filepath.Join(dir, name))
	if err != nil {
		common.ApiErrorMsg(c, "保存失败")
		return
	}
	defer out.Close()
	if _, err = io.Copy(out, f); err != nil {
		common.ApiErrorMsg(c, "保存失败")
		return
	}

	common.ApiSuccess(c, gin.H{
		"name": name,
		"url":  fmt.Sprintf("/glass-wallpapers/%s/%s", scope, name),
	})
}

// ListGlassWallpapers 壁纸清单（公开：用户选择时需要）
func ListGlassWallpapers(c *gin.Context) {
	entries := make([]GlassWallpaperEntry, 0)
	for _, scope := range []string{"day", "night"} {
		dir := glassWallpaperDir(scope)
		files, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		sort.Slice(files, func(i, j int) bool { return files[i].Name() < files[j].Name() })
		for _, f := range files {
			if f.IsDir() {
				continue
			}
			ext := strings.ToLower(filepath.Ext(f.Name()))
			if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
				continue
			}
			entries = append(entries, GlassWallpaperEntry{
				Name:  strings.TrimSuffix(f.Name(), ext),
				URL:   fmt.Sprintf("/glass-wallpapers/%s/%s", scope, f.Name()),
				Scope: scope,
				Size:  f.Size(),
			})
		}
	}
	common.ApiSuccess(c, entries)
}

// DeleteGlassWallpaper 管理员删除壁纸
func DeleteGlassWallpaper(c *gin.Context) {
	scope := c.Query("scope")
	name := c.Query("name")
	if (scope != "day" && scope != "night") || name == "" ||
		strings.Contains(name, "/") || strings.Contains(name, "\\") || strings.Contains(name, "..") {
		common.ApiErrorMsg(c, "参数非法")
		return
	}
	path := filepath.Join(glassWallpaperDir(scope), filepath.Base(name))
	if err := os.Remove(path); err != nil {
		common.ApiErrorMsg(c, "删除失败（可能不存在）")
		return
	}
	common.ApiSuccess(c, nil)
}
