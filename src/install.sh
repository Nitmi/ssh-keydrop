#!/bin/sh
# ssh-keydrop: adds the deployment owner's pinned keys to the current user's account.
# The function is invoked only after the complete script has been received.
ssh_keydrop_main() (
    set -eu
    umask 077
    fail() { printf 'ssh-keydrop: %s\n' "$*" >&2; exit 1; }
    [ "$#" -eq 0 ] || fail 'No arguments are supported. Run as the intended user.'
    [ -n "${HOME:-}" ] && [ -d "$HOME" ] || fail 'HOME must name an existing directory.'
    for tool in ssh-keygen awk mktemp mkdir chmod cat rm rmdir; do
        command -v "$tool" >/dev/null 2>&1 || fail "Required command missing: $tool"
    done
    ssh_dir=$HOME/.ssh
    authorized=$ssh_dir/authorized_keys
    [ ! -L "$ssh_dir" ] || fail 'Refusing a symlink at ~/.ssh.'
    [ ! -L "$authorized" ] || fail 'Refusing a symlink at authorized_keys.'
    [ ! -e "$authorized" ] || [ -f "$authorized" ] || fail 'authorized_keys must be a regular file.'
    mkdir -p "$ssh_dir"
    chmod 700 "$ssh_dir"
    lock=$ssh_dir/.ssh-keydrop.lock
    mkdir "$lock" 2>/dev/null || fail 'Another install is running, or a stale ~/.ssh/.ssh-keydrop.lock exists.'
    work=
    cleanup() {
        if [ -n "$work" ]; then rm -rf "$work"; fi
        rmdir "$lock"
    }
    trap cleanup EXIT
    trap 'exit 1' HUP INT TERM
    work=$(mktemp -d "$ssh_dir/.ssh-keydrop.XXXXXXXX")
    cat > "$work/keys" <<'SSH_KEYDROP_PINNED_KEYS'
@@PUBLIC_KEYS@@
SSH_KEYDROP_PINNED_KEYS
    # Validate every key before touching authorized_keys.
    while IFS= read -r key; do
        printf '%s\n' "$key" > "$work/key"
        ssh-keygen -lf "$work/key" >/dev/null 2>&1 || fail 'Invalid pinned public key.'
    done < "$work/keys"
    [ -e "$authorized" ] || : > "$authorized"
    chmod 600 "$authorized"
    # Match key material even when an existing line has options or a new comment.
    # Never rewrite those lines: their restrictions must remain intact.
    awk '
        FILENAME == ARGV[1] {
            if ($0 ~ /^[[:space:]]*#/) next
            for (i = 1; i < NF; i++) {
                if ($i ~ /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521))$/) {
                    seen[$i " " $(i + 1)] = 1
                    break
                }
            }
            next
        }
        !seen[$1 " " $2]++ { print }
    ' "$authorized" "$work/keys" > "$work/additions"
    count=$(awk 'END { print NR + 0 }' "$work/additions")
    if [ "$count" -gt 0 ]; then
        # A separator also handles an existing file without a final newline.
        if [ -s "$authorized" ]; then printf '\n' >> "$authorized"; fi
        cat "$work/additions" >> "$authorized"
    fi
    printf 'ssh-keydrop: added %s key(s) to %s\n' "$count" "$authorized"
)
ssh_keydrop_main "$@"
