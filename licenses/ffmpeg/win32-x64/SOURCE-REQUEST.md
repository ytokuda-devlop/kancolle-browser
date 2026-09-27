# Windows x64対応ソースの不足資料（未送信）

2026-09-23。タスク2の未完了事項を解消するための提供元への確認文案。
公開資料の確認先: https://www.gyan.dev/ffmpeg/builds/ 、
https://github.com/GyanD/codexffmpeg/releases/tag/6.1.1 。
この文書はソースの提供約束や、提供元から回答を得た記録ではない。

Subject: Corresponding source for FFmpeg 6.1.1 essentials Windows x64 build

We are preparing to redistribute `6.1.1-essentials_build-www.gyan.dev`,
obtained through ffmpeg-static release b6.1.1.
The SHA-256 of ffmpeg.exe is
`04e1307997530f9cf2fe35cba2ca7e8875ca91da02f89d6c7243df819c94ad00`.
The README identifies FFmpeg commit
`e38092ef9395d7049f871ef4d5411eb410e283e0`, whose upstream source we have saved.

We found a discrepancy when testing the actual binary with a generated 64x64 frame:
the README lists x265 `3.5-153-gce8642f22`, but the 8-bit, 10-bit and 12-bit
encoders all report `3.5+113-8787af124` (Windows, GCC 13.2.0).
We could not resolve `8787af124` in the current upstream Git repositories.
Please clarify the actual x265 source revision and how its version information
was generated, and provide all corresponding patches and multilib build settings.
We retained the README-specified `ce8642f22` source as a candidate only.

x264 reports `core 164 r3172 c1c9931` in H.264 SEI, libaom reports
`3.8.0-180-g0eeb62d344`, and libvpx reports `v1.13.1-601-g655da33b8`.
We saved source candidates for those revisions, with the remaining README-listed
components recorded separately. This does not establish the absence of patches.

Could you provide the complete corresponding source materials for this exact build,
or stable download locations for them, including:

- Exact source revisions and archives for all statically linked libraries and their
  dependencies, including the components without versions in the README
  (bzip2, GMP, GnuTLS, iconv, fontconfig, OpenJPEG, libxml2, xz/lzma, zlib).
- All local modifications and patches applied to FFmpeg and those libraries,
  or confirmation that a particular component used unmodified upstream source.
- The scripts and configuration used to compile and install this build and its
  libraries, with the required toolchain/package revisions and build instructions.
  Please include the ordered patch series and conditions, any local changes to
  the automation scripts, the package manifest, and CFLAGS/CXXFLAGS/LDFLAGS and
  pkg-config environment. We need the matching ffbuild/config.log, config.mak,
  config.h, dependency configuration logs/CMakeCache files, generated version
  headers, link inputs, and strip/packaging steps where used.
  FFmpeg reports GCC 12.2.0 (MSYS2 Rev10), whereas x265 reports GCC 13.2.0;
  please identify the toolchain used for each component rather than assuming one
  common toolchain. A fontconfig path contains W:/code/mabs/, but this does not
  tell us whether media-autobuild_suite was used or identify its revision/settings.
- The exact oneVPL source revision: the README lists `2.9`, but this is insufficient
  for us to identify the dispatcher source release/commit and its build options.
  Intel's changelog distinguishes API 2.9 from product release 2023.2.0 and later
  releases; please identify the actual dispatcher commit and patches used here.
- A complete dependency bill of materials, including indirect dependencies
  (for example libogg, crypto/TLS libraries and font library dependencies).
  The executable contains strings mentioning GnuTLS 3.6.16 and OpenSSL 3.0.7;
  please confirm their actual revisions, modifications and dependency chains.

Additional inspection (2026-09-24) found bzip2 `1.0.8, 13-Jul-2019`, a GMP 6.2.1
source path, Expat 2.5.0 version/source paths, and Nettle 3.8.1 source paths.
There are bare `5.2.9`, `1.2.13`, and `1.2.11` strings whose precise library or
header provenance is unresolved. Please provide the package manifest, static
link inputs and patches, rather than only confirming these version candidates.
libssh's `0.10.4/openssl/zlib` string is consistent with its OpenSSL and zlib backends.
libass reports full commit `c047dd2ea16f73abb4f448e6db3637158c1226d0`, with
FriBidi 1.0.13 and HarfBuzz 8.3.0 (those last two omit commit IDs).

We have retained the original README, license, and outputs of `-version`, `-L`,
and `-buildconf`. We need to preserve and offer the matching source materials
alongside our application release.
