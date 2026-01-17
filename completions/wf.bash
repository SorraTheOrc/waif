# Bash completion for wf
# Source this file from your ~/.bashrc or /etc/bash_completion.d

_wf_completion() {
  local cur
  cur="${COMP_WORDS[COMP_CWORD]}"

  if [ ${COMP_CWORD} -eq 1 ]; then
    local cmds
    cmds=$(wf --help 2>/dev/null | awk '/^Commands:/{flag=1; next} flag && NF{print $1}' | sed 's/,//g')
    COMPREPLY=( $(compgen -W "$cmds" -- "$cur") )
    return 0
  fi

  # Fallback to filename completion
  COMPREPLY=( $(compgen -f -- "$cur") )
}

complete -F _wf_completion wf
