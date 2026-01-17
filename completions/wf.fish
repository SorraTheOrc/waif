function __wf_complete
  set -lx cmd (commandline -opc)
  set -lx cword (count $cmd)
  if test $cword -eq 2
    set -l cmds (wf --help 2>/dev/null | string match -r '^\s*[a-zA-Z0-9-]+' -r)
    for c in $cmds
      echo $c
    end
    return
  end
  # fallback
  commandline -f complete
end

complete -c wf -a '(__wf_complete)'
