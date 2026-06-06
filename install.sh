#!/usr/bin/env bash
set -euo pipefail

platform=$(uname -ms)

if [[ ${OS:-} = Windows_NT ]]; then
	if [[ $platform != MINGW64* ]]; then
		powershell -c "irm cli.alisx.com/install.ps1|iex"
		exit $?
	fi
fi

# Reset
Color_Off=''

# Regular Colors
Red=''
Green=''
Dim='' # White

# Bold
Bold_White=''
Bold_Green=''

if [[ -t 1 ]]; then
	# Reset
	Color_Off='\033[0m' # Text Reset

	# Regular Colors
	Red='\033[0;31m'   # Red
	Green='\033[0;32m' # Green
	Dim='\033[0;2m'    # White

	# Bold
	Bold_Green='\033[1;32m' # Bold Green
	Bold_White='\033[1m'    # Bold White
fi

error() {
	echo -e "${Red}error${Color_Off}:" "$@" >&2
	exit 1
}

info() {
	echo -e "${Dim}$@ ${Color_Off}"
}

info_bold() {
	echo -e "${Bold_White}$@ ${Color_Off}"
}

success() {
	echo -e "${Green}$@ ${Color_Off}"
}

case $platform in
'Darwin x86_64')
	target=darwin-amd64
	;;
'Darwin arm64')
	target=darwin-arm64
	;;
'Linux aarch64' | 'Linux arm64')
	target=linux-arm64
	;;
'MINGW64'*)
	target=windows-amd64
	;;
'Linux riscv64')
	error 'Not supported on riscv64'
	;;
'Linux x86_64' | *)
	target=linux-amd64
	;;
esac

if [[ $target = darwin-x64 ]]; then
	if [[ $(sysctl -n sysctl.proc_translated 2>/dev/null) = 1 ]]; then
		target=darwin-arm64
		info "Your shell is running in Rosetta 2. Downloading alis for $target instead"
	fi
fi

exe_name=alis

alis_uri=https://cli.alisx.com/alis-$target-latest

install_env=ALIS_INSTALL
bin_env=\$$install_env/bin
install_dir=${!install_env:-$HOME/.alis}
bin_dir=$install_dir/bin
exe=$bin_dir/alis

if [[ ! -d $bin_dir ]]; then
	mkdir -p "$bin_dir" ||
		error "Failed to create ~/.alis/bin directory \"$bin_dir\""
fi

curl --fail --location --progress-bar --output "$exe" "$alis_uri" ||
	error "Failed to download alis from \"$alis_uri\""

chmod +x "$exe" ||
	error 'Failed to set permissions on alis executable'

tildify() {
	if [[ $1 = $HOME/* ]]; then
		local replacement=\~/

		echo "${1/$HOME\//$replacement}"
	else
		echo "$1"
	fi
}

success "alis was installed successfully to $Bold_Green$(tildify "$exe")"
tilde_bin_dir=$(tildify "$bin_dir")
quoted_install_dir=\"${install_dir//\"/\\\"}\"

if [[ $quoted_install_dir = \"$HOME/* ]]; then
	quoted_install_dir=${quoted_install_dir/$HOME\//\$HOME/}
fi

echo

case $(basename "$SHELL") in
fish)
	commands=(
		"set --export $install_env $quoted_install_dir"
		"set --export PATH $bin_env \$PATH"
	)

	fish_config=$HOME/.config/fish/config.fish
	tilde_fish_config=$(tildify "$fish_config")

	if [[ -w $fish_config ]]; then
		{
			echo -e '\n# alis'

			for command in "${commands[@]}"; do
				echo "$command"
			done
		} >>"$fish_config"

		info "Added \"$tilde_bin_dir\" to \$PATH in \"$tilde_fish_config\""

		refresh_command="source $tilde_fish_config"
	else
		echo "Manually add the directory to $tilde_fish_config (or similar):"

		for command in "${commands[@]}"; do
			info_bold "  $command"
		done
	fi
	;;
zsh)
	commands=(
		"export $install_env=$quoted_install_dir"
		"export PATH=\"$bin_env:\$PATH\""
	)

	zsh_config=$HOME/.zshrc
	tilde_zsh_config=$(tildify "$zsh_config")

	if [[ -w $zsh_config ]]; then
		{
			echo -e '\n# alis'

			for command in "${commands[@]}"; do
				echo "$command"
			done
		} >>"$zsh_config"

		info "Added \"$tilde_bin_dir\" to \$PATH in \"$tilde_zsh_config\""

		refresh_command="exec $SHELL"
	else
		echo "Manually add the directory to $tilde_zsh_config (or similar):"

		for command in "${commands[@]}"; do
			info_bold "  $command"
		done
	fi
	;;
bash)
	commands=(
		"export $install_env=$quoted_install_dir"
		"export PATH=\"$bin_env:\$PATH\""
	)

	bash_configs=(
		"$HOME/.bashrc"
		"$HOME/.bash_profile"
	)

	if [[ ${XDG_CONFIG_HOME:-} ]]; then
		bash_configs+=(
			"$XDG_CONFIG_HOME/.bash_profile"
			"$XDG_CONFIG_HOME/.bashrc"
			"$XDG_CONFIG_HOME/bash_profile"
			"$XDG_CONFIG_HOME/bashrc"
		)
	fi

	set_manually=true
	for bash_config in "${bash_configs[@]}"; do
		tilde_bash_config=$(tildify "$bash_config")

		if [[ -w $bash_config ]]; then
			{
				echo -e '\n# alis'

				for command in "${commands[@]}"; do
					echo "$command"
				done
			} >>"$bash_config"

			info "Added \"$tilde_bin_dir\" to \$PATH in \"$tilde_bash_config\""

			refresh_command="source $bash_config"
			set_manually=false
			break
		fi
	done

	if [[ $set_manually = true ]]; then
		echo "Manually add the directory to $tilde_bash_config (or similar):"

		for command in "${commands[@]}"; do
			info_bold "  $command"
		done
	fi
	;;
*)
	echo 'Manually add the directory to ~/.bashrc (or similar):'
	info_bold "  export $install_env=$quoted_install_dir"
	info_bold "  export PATH=\"$bin_env:\$PATH\""
	;;
esac

echo
info "To get started, restart your terminal session and run 'alis'"
echo
