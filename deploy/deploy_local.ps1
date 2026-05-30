param(
  [string]$HostName = "178.104.196.116",
  [string]$User = "root"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$RemoteTmp = "/tmp/as400-data-importer-pro"

npm --prefix $Root ci
npm --prefix $Root run build

ssh "$User@$HostName" "rm -rf $RemoteTmp && mkdir -p $RemoteTmp"
scp -r `
  "$Root\backend" `
  "$Root\deploy" `
  "$Root\dist" `
  "$Root\requirements.txt" `
  "$Root\package.json" `
  "$Root\package-lock.json" `
  "$Root\README.md" `
  "$User@$HostName`:$RemoteTmp/"
ssh "$User@$HostName" "bash $RemoteTmp/deploy/server_deploy.sh"
