#!/usr/bin/env python3
"""
ESign FINAL Patcher v3 - CERTIOS.XYZ
Key insight: DO NOT change backloop.dev hostname (it's invisible to users,
and changing it breaks OTA because the embedded SSL cert + URL structure)
"""
import os, shutil, subprocess

APP = '/home/pi/Downloads/CERTIOS.XYZ/server/scratch/esign_final/Payload/ESign.app'
BINARY = os.path.join(APP, 'ESign')

# ============================================================
# STEP 1: Patch binary - ONLY visible URLs, NOT backloop
# ============================================================
print("=" * 60)
print("STEP 1: Patch ESign binary")
print("=" * 60)

with open(BINARY, 'rb') as f:
    data = f.read()
original_size = len(data)

# CRITICAL: each replacement MUST be exact same byte length
replacements = [
    (
        b"https://khoindvn.io.vn",                    # 22 bytes
        b"https://cuios.shop\x00\x00\x00\x00",         # 22 bytes (18 + 4 null)
        "ESign Website -> cuios.shop"
    ),
    (
        b"https://api.khoindvn.io.vn/discord",        # 34 bytes
        b"https://t.me/chungchicuios\x00\x00\x00\x00\x00\x00\x00\x00",  # 34 bytes (26 + 8 null)
        "Discord link -> Telegram group"
    ),
    (
        b"https://api.khoindvn.io.vn/tele",           # 31 bytes
        b"https://t.me/chungchicuios\x00\x00\x00\x00\x00",              # 31 bytes (26 + 5 null)
        "Telegram link -> Telegram group"
    ),
    # DO NOT TOUCH backloop.dev - it controls OTA installation
    # khoindvn.backloop.dev is invisible to users (localhost only)
]

patched = data
for old, new, desc in replacements:
    assert len(old) == len(new), f"FATAL: Length mismatch for {desc}: {len(old)} != {len(new)}"
    count = patched.count(old)
    patched = patched.replace(old, new)
    status = "OK" if count > 0 else "SKIP (not found)"
    print(f"  [{status}] {desc}: {count} occurrence(s)")

assert len(patched) == original_size, "FATAL: Binary size changed!"
with open(BINARY, 'wb') as f:
    f.write(patched)

# Verify only khoindvn.backloop.dev remains (which is fine)
with open(BINARY, 'rb') as f:
    verify = f.read()
remaining = []
idx = 0
while True:
    idx = verify.find(b'khoindvn', idx)
    if idx < 0:
        break
    context = verify[idx:idx+30]
    readable = ''.join(chr(b) if 32<=b<127 else '' for b in context)
    remaining.append(readable)
    idx += 1

print(f"\n  Remaining 'khoindvn' strings: {len(remaining)}")
for r in remaining:
    print(f"    -> {r}  (backloop only - OK, invisible to users)")

# ============================================================
# STEP 2: Fix splash screen - remove khoindvn image
# ============================================================
print("\n" + "=" * 60)
print("STEP 2: Fix splash screen (LaunchScreen)")
print("=" * 60)

nib_path = os.path.join(APP, 'Base.lproj/LaunchScreen.storyboardc/01J-lp-oVM-view-Ze5-6b-2t3.nib')
with open(nib_path, 'rb') as f:
    nib_data = f.read()

# The nib references "icon-1024" which loads from Assets.car
# This shows khoindvn's custom logo. Replace with a non-existent name
# so no image shows (clean blank splash screen)
if b'icon-1024' in nib_data:
    # "icon-1024" is 9 bytes, replace with "zzzzzzzzz" (9 bytes) - won't match any asset
    nib_data = nib_data.replace(b'icon-1024', b'zzzzzzzzz')
    with open(nib_path, 'wb') as f:
        f.write(nib_data)
    print("  [OK] Replaced 'icon-1024' -> 'zzzzzzzzz' (no image will load = blank splash)")
else:
    print("  [INFO] 'icon-1024' not found in nib")

# Also remove app_logo.png which might be used somewhere
app_logo = os.path.join(APP, 'app_logo.png')
if os.path.exists(app_logo):
    os.remove(app_logo)
    print("  [OK] Deleted app_logo.png (khoindvn branded)")

# ============================================================
# STEP 3: Fix App Icons - use original ESign green icon
# ============================================================
print("\n" + "=" * 60)
print("STEP 3: Fix App Icons")
print("=" * 60)

# The icon.png, icon@2x.png, icon@3x.png are the ESign default icons (79KB each)
# AppIcon60x60@2x.png (5.8KB) and AppIcon76x76@2x~ipad.png (7.1KB) may be khoindvn branded
# Replace AppIcon with the icon.png (original ESign icon)

icon_src = os.path.join(APP, 'icon.png')
if os.path.exists(icon_src):
    for target in ['AppIcon60x60@2x.png', 'AppIcon76x76@2x~ipad.png']:
        target_path = os.path.join(APP, target)
        shutil.copy2(icon_src, target_path)
        print(f"  [OK] Replaced {target} with original ESign icon ({os.path.getsize(icon_src)} bytes)")
else:
    print("  [WARN] icon.png not found!")

# ============================================================
# STEP 4: Fix repo.txt - use AppTesters
# ============================================================
print("\n" + "=" * 60)
print("STEP 4: Fix repo.txt -> AppTesters IPA Repo")
print("=" * 60)

repo_path = os.path.join(APP, 'repo.txt')
with open(repo_path, 'r') as f:
    old_repos = f.read().strip()
print(f"  Old: {old_repos}")

new_repos = "https://repository.apptesters.org"
with open(repo_path, 'w') as f:
    f.write(new_repos)
print(f"  New: {new_repos}")
print("  [OK] repo.txt updated")

# ============================================================
# STEP 5: Clean signing-assets
# ============================================================
print("\n" + "=" * 60)
print("STEP 5: Clean signing-assets")
print("=" * 60)

khoindvn_assets = os.path.join(APP, 'signing-assets/khoindvn.io.vn')
if os.path.exists(khoindvn_assets):
    shutil.rmtree(khoindvn_assets)
    print("  [OK] Removed signing-assets/khoindvn.io.vn/")

cuios_assets = os.path.join(APP, 'signing-assets/cuios.shop')
os.makedirs(cuios_assets, exist_ok=True)
print("  [OK] Created signing-assets/cuios.shop/ (empty, for cert injection)")

# ============================================================
# STEP 6: Verify OTA is UNTOUCHED
# ============================================================
print("\n" + "=" * 60)
print("STEP 6: Verify OTA backloop is intact")
print("=" * 60)

with open(BINARY, 'rb') as f:
    check = f.read()

# Verify the exact bytes at the critical OTA offsets
hostname_check = check.find(b'khoindvn.backloop.dev')
url_check = check.find(b'khoindvn.backloop.dev:')
print(f"  Hostname 'khoindvn.backloop.dev' found at offset: {hostname_check}")
print(f"  URL suffix 'khoindvn.backloop.dev:' found at offset: {url_check}")
if hostname_check >= 0 and url_check >= 0:
    print("  [OK] OTA backloop.dev is INTACT - installation will work!")
else:
    print("  [FAIL] OTA backloop data missing!")

# ============================================================
# STEP 7: Verify all changes
# ============================================================
print("\n" + "=" * 60)
print("STEP 7: Final verification")
print("=" * 60)

# Check visible URLs
for check_str in [b'https://cuios.shop', b'https://t.me/chungchicuios']:
    if check_str in check:
        print(f"  [OK] Found: {check_str.decode()}")
    else:
        print(f"  [FAIL] NOT Found: {check_str.decode()}")

# Check khoindvn.io.vn is gone
if b'khoindvn.io.vn' not in check:
    print("  [OK] khoindvn.io.vn completely removed")
else:
    print("  [FAIL] khoindvn.io.vn still present!")

# Check api.khoindvn.io.vn is gone
if b'api.khoindvn.io.vn' not in check:
    print("  [OK] api.khoindvn.io.vn completely removed")
else:
    print("  [FAIL] api.khoindvn.io.vn still present!")

# Check repo
with open(repo_path) as f:
    print(f"  [OK] repo.txt = {f.read().strip()}")

# Check signing assets
sa_dir = os.path.join(APP, 'signing-assets')
print(f"  [OK] signing-assets contents: {os.listdir(sa_dir)}")

# Check app logo deleted
if not os.path.exists(app_logo):
    print("  [OK] app_logo.png deleted")

# ============================================================
# STEP 8: Repack
# ============================================================
print("\n" + "=" * 60)
print("STEP 8: Repack to IPA")
print("=" * 60)

work_dir = '/home/pi/Downloads/CERTIOS.XYZ/server/scratch/esign_final'
template_out = '/home/pi/Downloads/CERTIOS.XYZ/server/templates/ESign_CERTIOS_TEMPLATE.ipa'
subprocess.run(f'cd "{work_dir}" && zip -qr "{template_out}" Payload', shell=True, check=True)
size_mb = os.path.getsize(template_out) / 1024 / 1024
print(f"  [OK] Created template: {size_mb:.2f} MB")
print("\nALL DONE!")
