---
description: G8 云端推送前脱敏终扫：八模式扫描零命中才推 PUBLIC（v0.4.0 新增）
argument-hint: [仓路径]
skills: coordination
---

云端推送前脱敏终扫（v0.4.0 G8 新增）。参数：`$ARGUMENTS`（仓路径，缺省当前仓）

## 扫描模式（八组）

对目标仓全部文本文件（.md/.py/.c/.h/.js/.ts/.ino/.yml/.json/.bat/.sh）扫描：

1. `C:\Users` / `C:/Users`（本机绝对路径）
2. `E:\` / `E:/`（项目盘路径）
3. `D:\esp` / `D:\Espressif`（工具链路径）
4. 用户名（`seeed` / 系统用户名）
5. 内部代号（`移植层` / `治理仓` / `L-v` / `MagicRobot` / 项目内部 ID）
6. `github_pat_` / `ghp_` / `gho_` / `ghs_`（GitHub token 前缀）
7. `sk-` / `eyJ` / `AKIA` / `xox`（API key/JWT/AWS/Slack）
8. `token=` / `password=` / `api_key=` 后跟长字符串字面量

## 执行

```bash
# 在目标仓根执行
for pat in 'C:\\Users' 'E:\\' 'D:\\esp\\' 'D:\\Espressif' 'seeed' 'MagicRobot' \
           'github_pat_\|ghp_\|AKIA\|xox\|eyJ' '移植层\|治理仓\|L-v2'; do
  n=$(grep -rli "$pat" --include="*.md" --include="*.py" --include="*.c" \
      --include="*.h" --include="*.ino" --include="*.yml" --include="*.json" \
      --include="*.bat" --include="*.sh" . 2>/dev/null | grep -v ".git/" | wc -l)
  echo "$pat: $n"
done
```

## 判定

- **全部 0** → 可以推送（git push origin main/master）
- **任一非 0** → 展示命中文件+行，**禁止推送**，整改后重扫

## 注意

- `sk-` 误报：英文单词含 "task-" 的子串（如 `Task-card`）会命中——需人工确认是否真实 token
- 此命令在推 **PUBLIC** 仓前必跑；私有仓推送可跳过
- 全局纪律 §1（云端提交全部脱敏）的自动化实现
