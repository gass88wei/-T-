package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App 持有应用上下文与数据文件路径。
type App struct {
	ctx      context.Context
	dataDir  string
	dataFile string
}

func NewApp() *App { return &App{} }

// defaultData 是首次启动时的空数据结构。
const defaultData = `{
  "version": 1,
  "settings": {
    "commissionRate": 0.00025,
    "minCommission": 5,
    "stampDuty": 0.001,
    "transferFee": 0.00001
  },
  "stocks": [],
  "simpleLog": [],
  "tradeRecords": [],
  "savedCodes": [],
  "calcHistory": [],
  "compoundHistory": [],
  "finance": {
    "transactions": [],
    "goals": [],
    "settings": { "yieldRate": 4, "targetExpense": 5000 }
  }
}`

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	a.dataDir = filepath.Join(home, ".local", "share", "zuot-terminal")
	a.dataFile = filepath.Join(a.dataDir, "data.json")

	if err := os.MkdirAll(a.dataDir, 0o755); err != nil {
		fmt.Println("创建数据目录失败:", err)
	}
	if _, err := os.Stat(a.dataFile); os.IsNotExist(err) {
		if werr := os.WriteFile(a.dataFile, []byte(defaultData), 0o644); werr != nil {
			fmt.Println("写入初始数据失败:", werr)
		}
	}
}

// DataPath 返回数据文件的绝对路径，供界面显示。
func (a *App) DataPath() string { return a.dataFile }

// LoadData 读取全部数据。若主文件损坏，自动回滚到 .bak。
func (a *App) LoadData() (string, error) {
	raw, err := os.ReadFile(a.dataFile)
	if err != nil {
		return "", fmt.Errorf("读取数据文件失败: %w", err)
	}
	if json.Valid(raw) {
		return string(raw), nil
	}

	// 主文件损坏，尝试备份
	bak := a.dataFile + ".bak"
	if braw, berr := os.ReadFile(bak); berr == nil && json.Valid(braw) {
		_ = os.WriteFile(a.dataFile, braw, 0o644)
		return string(braw), nil
	}
	return "", fmt.Errorf("数据文件已损坏且备份不可用，已保留原文件于 %s", a.dataFile)
}

// SaveData 校验并原子写入数据，同时保留上一版 .bak。
func (a *App) SaveData(data string) error {
	if !json.Valid([]byte(data)) {
		return fmt.Errorf("数据格式非法（不是合法 JSON），已拒绝写入")
	}
	if err := os.MkdirAll(a.dataDir, 0o755); err != nil {
		return fmt.Errorf("创建数据目录失败: %w", err)
	}

	// 备份旧文件
	if old, err := os.ReadFile(a.dataFile); err == nil && json.Valid(old) {
		_ = os.WriteFile(a.dataFile+".bak", old, 0o644)
	}

	tmp := a.dataFile + ".tmp"
	f, err := os.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o644)
	if err != nil {
		return fmt.Errorf("创建临时文件失败: %w", err)
	}
	if _, err := f.WriteString(data); err != nil {
		f.Close()
		os.Remove(tmp)
		return fmt.Errorf("写入临时文件失败: %w", err)
	}
	if err := f.Sync(); err != nil {
		f.Close()
		os.Remove(tmp)
		return fmt.Errorf("刷盘失败: %w", err)
	}
	f.Close()
	if err := os.Rename(tmp, a.dataFile); err != nil {
		os.Remove(tmp)
		return fmt.Errorf("替换数据文件失败: %w", err)
	}
	return nil
}

// ExportData 弹出保存对话框，把当前数据导出为用户选定的 JSON 文件。
func (a *App) ExportData(data string) (string, error) {
	path, err := runtime.SaveFileDialog(a.ctx, runtime.SaveDialogOptions{
		Title:           "导出做T全能终端数据",
		DefaultFilename: "做T全能终端备份_" + time.Now().Format("20060102_1504") + ".json",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON 数据 (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil // 用户取消
	}
	if !json.Valid([]byte(data)) {
		return "", fmt.Errorf("数据格式非法，已拒绝导出")
	}
	if err := os.WriteFile(path, []byte(data), 0o644); err != nil {
		return "", fmt.Errorf("写入导出文件失败: %w", err)
	}
	return path, nil
}

// ImportData 弹出打开对话框，读取用户选定的 JSON 文件内容。
func (a *App) ImportData() (string, error) {
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "导入做T全能终端数据",
		Filters: []runtime.FileFilter{
			{DisplayName: "JSON 数据 (*.json)", Pattern: "*.json"},
		},
	})
	if err != nil {
		return "", err
	}
	if path == "" {
		return "", nil // 用户取消
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("读取导入文件失败: %w", err)
	}
	if !json.Valid(raw) {
		return "", fmt.Errorf("所选文件不是合法 JSON")
	}
	return string(raw), nil
}

// AppVersion 供界面显示版本号。
func (a *App) AppVersion() string { return "1.2.0" }
