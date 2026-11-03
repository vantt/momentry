#!/bin/sh
# momentry installer for Linux, macOS and WSL (Windows: install.ps1).
# Adapted from cs-packaging-distribution templates/install.sh. momentry ships as a source tarball run by Node,
# so the installer only downloads, verifies and unpacks it; the new version itself then writes `current`,
# the shim and the marker (`momentry _activate`), so the layout is defined in one place (lib/install.mjs).
# main "$@" is the LAST line so a truncated `curl | sh` never runs a partial script.
set -eu

REPO="vantt/momentry"
DEFAULT_VERSION='@VERSION@'       # stamped by scripts/package-release.mjs; unstamped copy installs the latest release
SHIM_TAG="momentry shim: managed by momentry"
MAX_BYTES=33554432                # 32 MiB per download

usage() {
  cat <<EOF
Cài, cập nhật hoặc gỡ momentry (Linux, macOS, WSL). Cần Node ≥ 20.

Cách dùng:
  curl -fsSL https://github.com/${REPO}/releases/latest/download/install.sh | sh
  curl -fsSL https://github.com/${REPO}/releases/latest/download/install.sh | sh -s -- [cờ]

Cờ (mỗi cờ cũng là một biến môi trường):
  --version <vX.Y.Z>     cài bản này                       MOMENTRY_VERSION      (mặc định: bản của installer này)
  --install-dir <dir>    nơi đặt lệnh momentry              MOMENTRY_INSTALL_DIR  (mặc định: ~/.local/bin)
  --home <dir>           nơi đặt mã nguồn các bản           MOMENTRY_HOME         (mặc định: ~/.local/share/momentry)
  --local-fixture <dir>  cài từ thư mục chứa asset đã tải   MOMENTRY_RELEASE_BASE=<dir>  (máy không mạng, mirror, test)
  --dry-run              chỉ in sẽ làm gì                   MOMENTRY_DRY_RUN=1
  --no-modify-path       không in hướng dẫn PATH            MOMENTRY_NO_MODIFY_PATH=1
  --uninstall            gỡ momentry (giữ cấu hình, cache)  MOMENTRY_UNINSTALL=1
  -y, --yes              không hỏi                          MOMENTRY_YES=1
  -h, --help             trợ giúp này
Khác: MOMENTRY_RELEASE_BASE (mirror, bản nháp), MOMENTRY_ALLOW_ROOT=1

Mã thoát: 0 xong, 1 lỗi, 2 sai cú pháp.
Cài xong, chạy:  momentry init
EOF
}

say() { printf '%s\n' "$*" >&2; }
die() { say "lỗi: $1"; [ -z "${2:-}" ] || say "  vì: $2"; [ -z "${3:-}" ] || say "  sửa: $3"; exit 1; }
usage_err() { say "lỗi: $1"; say "  sửa: sh install.sh --help"; exit 2; }

parse_args() {
  VERSION="${MOMENTRY_VERSION:-$DEFAULT_VERSION}"
  INSTALL_DIR="${MOMENTRY_INSTALL_DIR:-$HOME/.local/bin}"
  HOME_DIR="${MOMENTRY_HOME:-${XDG_DATA_HOME:-$HOME/.local/share}/momentry}"
  BASE="${MOMENTRY_RELEASE_BASE:-https://github.com/$REPO/releases}"
  DRY_RUN="${MOMENTRY_DRY_RUN:-0}"; NO_PATH="${MOMENTRY_NO_MODIFY_PATH:-0}"
  UNINSTALL="${MOMENTRY_UNINSTALL:-0}"; YES="${MOMENTRY_YES:-0}"
  while [ $# -gt 0 ]; do
    case "$1" in
      --version|--install-dir|--home|--local-fixture)
        [ $# -ge 2 ] && [ -n "$2" ] || usage_err "$1 cần một giá trị"
        case "$1" in
          --version) VERSION="$2" ;; --install-dir) INSTALL_DIR="$2" ;;
          --home) HOME_DIR="$2" ;; --local-fixture) BASE="$2" ;;
        esac; shift ;;
      --version=*) VERSION="${1#*=}" ;;
      --install-dir=*) INSTALL_DIR="${1#*=}" ;;
      --home=*) HOME_DIR="${1#*=}" ;;
      --local-fixture=*) BASE="${1#*=}" ;;
      --dry-run) DRY_RUN=1 ;;
      --no-modify-path) NO_PATH=1 ;;
      --uninstall) UNINSTALL=1 ;;
      -y|--yes) YES=1 ;;
      -h|--help) usage; exit 0 ;;
      *) usage_err "cờ lạ: $1" ;;
    esac; shift
  done
  case "$VERSION" in @*@|latest) VERSION=latest ;; v*) ;; [0-9]*) VERSION="v$VERSION" ;; *) usage_err "phiên bản không hợp lệ: $VERSION" ;; esac
  case "$BASE" in
    https://*) LOCAL=0 ;;
    http://*) die "chỉ tải qua HTTPS: $BASE" ;;
    *) [ -d "$BASE" ] || die "không có thư mục asset: $BASE"; LOCAL=1 ;;
  esac
  if [ "$(id -u)" = 0 ] && [ "${MOMENTRY_ALLOW_ROOT:-0}" != 1 ]; then
    die "không chạy với quyền root" "momentry cài theo từng user" "chạy lại bằng user của bạn, hoặc đặt MOMENTRY_ALLOW_ROOT=1"
  fi
}

check_platform() {
  case "$(uname -s)" in
    Linux|Darwin) ;;
    MINGW*|MSYS*|CYGWIN*) die "đang ở shell Windows" "" "trong PowerShell: irm https://github.com/$REPO/releases/latest/download/install.ps1 | iex" ;;
    *) say "lưu ý: $(uname -s) chưa được thử; tiếp tục vì momentry chỉ cần Node" ;;
  esac
  command -v node >/dev/null 2>&1 || die "không thấy node trên PATH" "momentry chạy bằng Node ≥ 20" "cài Node từ https://nodejs.org (hoặc: nvm install 22), rồi chạy lại"
  node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' \
    || die "Node $(node --version) quá cũ" "momentry cần Node ≥ 20" "cài Node mới từ https://nodejs.org (hoặc: nvm install 22)"
  command -v tar >/dev/null 2>&1 || die "cần tar" "" "cài tar (apt install tar / apk add tar)"
}

url_of() {  # asset name -> URL or local path
  if [ "$LOCAL" = 1 ]; then printf '%s/%s' "$BASE" "$1"
  elif [ "$VERSION" = latest ]; then printf '%s/latest/download/%s' "$BASE" "$1"
  else printf '%s/download/%s/%s' "$BASE" "$VERSION" "$1"; fi
}

fetch() {  # url dest — HTTPS only, wall-clock timeout, size cap
  if [ "$LOCAL" = 1 ]; then cp "$1" "$2" 2>/dev/null || die "không có $1"; return 0; fi
  if command -v curl >/dev/null 2>&1; then
    curl --proto '=https' --tlsv1.2 -fsSL --connect-timeout 10 --max-time 120 --max-filesize "$MAX_BYTES" -o "$2" "$1" \
      || die "tải lỗi: $1" "mạng lỗi hoặc bản phát hành không có file này" "kiểm phiên bản có trong $BASE"
  elif command -v wget >/dev/null 2>&1; then
    if command -v timeout >/dev/null 2>&1; then timeout 130 wget -q -O "$2" "$1"; else wget -q -O "$2" "$1"; fi \
      || die "tải lỗi: $1" "mạng lỗi hoặc bản phát hành không có file này" "kiểm phiên bản có trong $BASE"
    [ "$(wc -c < "$2")" -le "$MAX_BYTES" ] || die "file tải về quá lớn: $1"
  else
    die "cần curl hoặc wget" "" "cài curl (apt install curl / apk add curl)"
  fi
}

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | cut -d' ' -f1
  elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | cut -d' ' -f1
  elif command -v openssl >/dev/null 2>&1; then openssl dgst -sha256 "$1" | awk '{print $NF}'
  else die "không có công cụ SHA-256" "" "cài coreutils hoặc openssl"; fi
}

resolve_asset() {  # exactly one momentry-v*.tar.gz in checksums.txt; it names the version
  ASSET="$(awk '{n=$2; sub(/^\*/,"",n); if (n ~ /^momentry-v[0-9][0-9A-Za-z.-]*\.tar\.gz$/) {print n; c++}} END{if (c!=1) exit 1}' "$TMP/checksums.txt")" \
    || die "checksums.txt phải có đúng một momentry-v*.tar.gz" "bản phát hành không đầy đủ" "thử lại sau hoặc chọn --version khác"
  got="${ASSET#momentry-}"; got="${got%.tar.gz}"
  if [ "$VERSION" != latest ] && [ "$got" != "$VERSION" ]; then die "checksums.txt của $VERSION trỏ tới $ASSET"; fi
  VERSION="$got"
}

verify() {  # exact filename match, exactly one entry
  expected="$(awk -v f="$ASSET" '{n=$2; sub(/^\*/,"",n); if (n==f) {print $1; c++}} END{if (c!=1) exit 1}' "$TMP/checksums.txt")" \
    || die "checksums.txt thiếu hoặc lặp $ASSET" "bản phát hành không đầy đủ" "thử lại sau hoặc chọn --version khác"
  [ "$(sha256 "$TMP/$ASSET")" = "$expected" ] || die "sha256 của $ASSET không khớp" "file hỏng hoặc bị sửa" "thử lại; báo lỗi nếu còn gặp"
  say "đã kiểm sha256 $ASSET (chưa kiểm chữ ký)"
}

check_layout() {  # allow-list: everything under momentry-vX/{bin,lib,prompts,BUILD,LICENSE,README.md}, no links
  top="momentry-$VERSION"
  if tar -tzvf "$TMP/$ASSET" | awk '{print substr($1,1,1)}' | grep -q '[lhcbp]'; then die "archive có link hoặc file đặc biệt" "archive không an toàn" "báo lỗi bản phát hành này"; fi
  tar -tzf "$TMP/$ASSET" > "$TMP/list"
  while IFS= read -r m; do
    case "$m" in
      /*|*..*) die "đường dẫn không an toàn trong archive: $m" ;;
      "$top/"|"$top/bin"|"$top/bin/"*|"$top/lib"|"$top/lib/"*|"$top/prompts"|"$top/prompts/"*|"$top/BUILD"|"$top/LICENSE"|"$top/README.md") ;;
      *) die "file lạ trong archive: $m" "bố cục khác quy ước" "báo lỗi bản phát hành này" ;;
    esac
  done < "$TMP/list"
}

guard_shim() {  # never overwrite a `momentry` we did not install
  target="$INSTALL_DIR/momentry"
  if [ -e "$target" ] && ! grep -q "$SHIM_TAG" "$target" 2>/dev/null; then
    die "$target đã có và không do momentry cài" "" "xoá nó, hoặc dùng --install-dir <thư mục khác>"
  fi
}

install_version() {
  check_layout
  dest="$HOME_DIR/versions/$VERSION"
  current="$(cat "$HOME_DIR/current" 2>/dev/null || true)"
  # no-op only when the active copy still runs; a damaged copy of the same version is replaced
  if [ "$current" = "$VERSION" ] && [ -f "$HOME_DIR/.momentry-managed" ] \
     && [ "$(node "$dest/bin/momentry.mjs" --version 2>/dev/null || true)" = "momentry ${VERSION#v}" ]; then
    say "đã cài $VERSION; không có gì phải làm"
    return 0
  fi
  if [ "$DRY_RUN" = 1 ]; then
    say "dry-run: sẽ giải nén $ASSET vào $dest, ghi $HOME_DIR/current, shim $INSTALL_DIR/momentry"
    return 0
  fi
  mkdir -p "$HOME_DIR/versions"
  stage="$HOME_DIR/versions/.$VERSION.tmp.$$"
  rm -rf "$stage"; mkdir -p "$stage"
  tar -xzf "$TMP/$ASSET" -C "$stage"
  [ -f "$stage/momentry-$VERSION/bin/momentry.mjs" ] || { rm -rf "$stage"; die "archive không có bin/momentry.mjs"; }
  reported="$(node "$stage/momentry-$VERSION/bin/momentry.mjs" --version 2>/dev/null || true)"
  [ "$reported" = "momentry ${VERSION#v}" ] || { rm -rf "$stage"; die "bản tải về không chạy được ($reported)" "file hỏng hoặc Node quá cũ" "chạy lại; báo lỗi kèm: node --version, uname -sm"; }
  old=""
  if [ -d "$dest" ]; then old="$dest.old.$$"; mv "$dest" "$old"; fi
  mv "$stage/momentry-$VERSION" "$dest"
  rm -rf "$stage"
  [ -z "$old" ] || rm -rf "$old"
  MOMENTRY_HOME="$HOME_DIR" MOMENTRY_INSTALL_DIR="$INSTALL_DIR" node "$dest/bin/momentry.mjs" _activate \
    || { [ -z "$current" ] || printf '%s\n' "$current" > "$HOME_DIR/current"; die "kích hoạt $VERSION lỗi" "" "chạy lại installer"; }
}

confirm() {  # ask via /dev/tty (stdin is the script under curl|sh); no TTY -> require --yes
  [ "$YES" = 1 ] && return 0
  if (: </dev/tty >/dev/tty) 2>/dev/null; then
    printf '%s [y/N] ' "$1" > /dev/tty; read -r ans < /dev/tty || ans=""
    case "$ans" in y|Y|yes|YES|c|C|có) return 0 ;; *) say "đã huỷ"; exit 1 ;; esac
  fi
  die "cần xác nhận nhưng không có terminal" "" "chạy lại với --yes"
}

uninstall() {
  shim="$INSTALL_DIR/momentry"
  if [ -f "$HOME_DIR/.momentry-managed" ] && [ -x "$shim" ] && grep -q "$SHIM_TAG" "$shim" 2>/dev/null; then
    say "giữ lại: cấu hình và cache (xoá luôn: $shim uninstall --purge --yes)"
    if [ "$DRY_RUN" = 1 ]; then MOMENTRY_HOME="$HOME_DIR" MOMENTRY_INSTALL_DIR="$INSTALL_DIR" "$shim" uninstall --dry-run; return 0; fi
    confirm "Gỡ momentry?"
    MOMENTRY_HOME="$HOME_DIR" MOMENTRY_INSTALL_DIR="$INSTALL_DIR" "$shim" uninstall --yes
    return 0
  fi
  [ -f "$HOME_DIR/.momentry-managed" ] || die "không thấy bản cài của installer này ở $HOME_DIR" "" "dùng --home <dir> nếu đã cài nơi khác"
  say "sẽ xoá: $HOME_DIR$( grep -q "$SHIM_TAG" "$shim" 2>/dev/null && printf ', %s' "$shim")"
  [ "$DRY_RUN" = 1 ] && { say "dry-run: không xoá gì"; return 0; }
  confirm "Gỡ momentry?"
  grep -q "$SHIM_TAG" "$shim" 2>/dev/null && rm -f "$shim"
  rm -rf "$HOME_DIR"
  say "đã gỡ momentry (hook trong ~/.claude, ~/.codex: gỡ bằng tay nếu còn)"
}

next_steps() {  # the same steps as README quick start and `momentry init`
  bin="momentry"
  case ":$PATH:" in
    *":$INSTALL_DIR:"*) ;;
    *) bin="$INSTALL_DIR/momentry"
       [ "$NO_PATH" = 1 ] || say "PATH: thêm dòng này vào ~/.bashrc hoặc ~/.zshrc:  export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
  esac
  say "đã cài: $("$INSTALL_DIR/momentry" --version 2>/dev/null || echo "momentry $VERSION")"
  say "Tiếp:"
  say "  1. $bin init"
  say "  2. $bin scan --max-sessions 1"
  say "  3. $bin list --rank"
}

main() {
  parse_args "$@"
  if [ "$UNINSTALL" = 1 ]; then uninstall; return 0; fi
  check_platform
  guard_shim
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT; trap 'exit 130' INT TERM
  fetch "$(url_of checksums.txt)" "$TMP/checksums.txt"
  resolve_asset
  fetch "$(url_of "$ASSET")" "$TMP/$ASSET"
  verify
  install_version
  [ "$DRY_RUN" = 1 ] || next_steps
}

main "$@"
