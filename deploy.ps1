# 一鍵部署腳本：把前端 / 後端更新推上 Cloud Run。
#
# 用法（在專案根目錄 allsheet 執行）：
#   .\deploy.ps1            # 前後端都部署
#   .\deploy.ps1 api        # 只部署後端
#   .\deploy.ps1 web        # 只部署前端
#   .\deploy.ps1 -DryRun    # 只印出會執行的指令，不真的部署
#
# 改完程式碼後跑這個就好，不用再記那一長串 gcloud 指令。

param(
    [ValidateSet("all", "web", "api")]
    [string]$Target = "all",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# ---- 專案設定（之後若換專案/區域，只要改這裡）----
$Project = "sheet-5b247"
$Region  = "asia-east1"
$ApiService = "allsheet-api"
$WebService = "allsheet-web"
$WebImage   = "asia-east1-docker.pkg.dev/$Project/allsheet/frontend:latest"

function Run-Step([string]$Title, [string[]]$CmdArgs) {
    Write-Host ""
    Write-Host "==> $Title" -ForegroundColor Cyan
    Write-Host ("    gcloud " + ($CmdArgs -join " ")) -ForegroundColor DarkGray
    if ($DryRun) { return }
    & gcloud @CmdArgs
    if ($LASTEXITCODE -ne 0) {
        throw "$Title 失敗（exit code $LASTEXITCODE）"
    }
}

$start = Get-Date
Write-Host "部署目標：$Target　專案：$Project　區域：$Region" -ForegroundColor Yellow
if ($DryRun) { Write-Host "(DryRun 模式：只印指令，不實際部署)" -ForegroundColor Yellow }

if ($Target -eq "all" -or $Target -eq "api") {
    Run-Step "部署後端 $ApiService（從 backend/ 原始碼建置）" @(
        "run", "deploy", $ApiService,
        "--source", "backend",
        "--region", $Region,
        "--project", $Project,
        "--memory", "1Gi",
        "--quiet"
    )
}

if ($Target -eq "all" -or $Target -eq "web") {
    Run-Step "建置前端 image（內嵌 NEXT_PUBLIC_* 設定）" @(
        "builds", "submit",
        "--config", "cloudbuild.yaml",
        "--project", $Project,
        "."
    )
    Run-Step "部署前端 $WebService" @(
        "run", "deploy", $WebService,
        "--image", $WebImage,
        "--region", $Region,
        "--project", $Project,
        "--quiet"
    )
}

$elapsed = [int]((Get-Date) - $start).TotalSeconds
Write-Host ""
Write-Host "✅ 完成（耗時 ${elapsed}s）" -ForegroundColor Green
Write-Host "   前端： https://allsheet-web-404452605737.asia-east1.run.app" -ForegroundColor Green
Write-Host "   後端： https://allsheet-api-404452605737.asia-east1.run.app" -ForegroundColor Green
