#!/usr/bin/env python3
"""
ESign V2 Final Patcher - CERTIOS.XYZ
Patches ESign_v1.ipa to remove ALL khoindvn references.
Each replacement is byte-length verified to prevent binary corruption.
"""
import os
import shutil

WORK = '/home/pi/Downloads/CERTIOS.XYZ/server/scratch/esign_final'
APP = os.path.join(WORK, 'Payload/ESign.app')
BINARY = os.path.join(APP, 'ESign')

print("=" * 60)
print("STEP 1: Patch ESign binary (5 replacements)")
print("=" * 60)

with open(BINARY, 'rb') as f:
    data = f.read()

original_size = len(data)

replacements = [
    # (old_bytes, new_bytes, description)
    (
        b"https://khoindvn.io.vn",
        b"https://cuios.shop\x00\x00\x00\x00",
        "Website URL -> cuios.shop"
    ),
    (
        b"https://api.khoindvn.io.vn/discord",
        b"https://t.me/chungchicuios\x00\x00\x00\x00\x00\x00\x00\x00",
        "Discord -> Telegram group"
    ),
    (
        b"https://api.khoindvn.io.vn/tele",
        b"https://t.me/chungchicuios\x00\x00\x00\x00\x00",
        "Telegram URL -> Telegram group"
    ),
    (
        b"khoindvn.backloop.dev",
        b"certios.backloop.dev\x00",
        "OTA hostname (CRITICAL - must stay *.backloop.dev for SSL cert)"
    ),
    (
        b"https://khoindvn.backloop.dev:",
        b"https://certios.backloop.dev:\x00",
        "OTA HTTPS URL (CRITICAL)"
    ),
]

patched = data
for old, new, desc in replacements:
    assert len(old) == len(new), f"LENGTH MISMATCH for {desc}: {len(old)} != {len(new)}"
    count = patched.count(old)
    patched = patched.replace(old, new)
    print(f"  [OK] {desc}")
    print(f"       {old} -> {new}")
    print(f"       Found {count} occurrence(s), len={len(old)}")

assert len(patched) == original_size, "FATAL: Binary size changed!"

with open(BINARY, 'wb') as f:
    f.write(patched)
print(f"\n  Binary patched OK. Size unchanged: {original_size} bytes.\n")

# Verify no khoindvn remains in binary
with open(BINARY, 'rb') as f:
    verify = f.read()
if b'khoindvn' in verify:
    print("  [WARNING] khoindvn still found in binary!")
else:
    print("  [VERIFIED] No 'khoindvn' string remains in binary.\n")


print("=" * 60)
print("STEP 2: Fix repo.txt (remove khoindvn repo)")
print("=" * 60)

repo_path = os.path.join(APP, 'repo.txt')
with open(repo_path, 'r') as f:
    repos = f.read().strip().split('\n')

print(f"  Original repos: {repos}")

# Remove khoindvn repo, keep the rest
new_repos = [r for r in repos if 'khoindvn' not in r]
# Add our own repo at the top
new_repos.insert(0, 'https://certios.xyz/apps.json')
# Remove duplicates while preserving order
seen = set()
unique_repos = []
for r in new_repos:
    if r not in seen:
        seen.add(r)
        unique_repos.append(r)

with open(repo_path, 'w') as f:
    f.write('\n'.join(unique_repos))

print(f"  New repos: {unique_repos}")
print("  [OK] repo.txt updated.\n")


print("=" * 60)
print("STEP 3: Clean signing-assets (remove khoindvn certs)")
print("=" * 60)

khoindvn_assets = os.path.join(APP, 'signing-assets/khoindvn.io.vn')
if os.path.exists(khoindvn_assets):
    shutil.rmtree(khoindvn_assets)
    print("  [OK] Removed signing-assets/khoindvn.io.vn/")

# Create clean cuios.shop folder for cert injection
cuios_assets = os.path.join(APP, 'signing-assets/cuios.shop')
os.makedirs(cuios_assets, exist_ok=True)
print("  [OK] Created signing-assets/cuios.shop/ (empty, ready for injection)\n")


print("=" * 60)
print("STEP 4: Fix LaunchScreen (splash image)")
print("=" * 60)

nib_path = os.path.join(APP, 'Base.lproj/LaunchScreen.storyboardc/01J-lp-oVM-view-Ze5-6b-2t3.nib')
with open(nib_path, 'rb') as f:
    nib_data = f.read()

# The nib currently references "icon-1024" which is the ESign default logo
# Check if it was previously patched to something else
if b'icon-1024' in nib_data:
    print("  [OK] LaunchScreen already uses default ESign icon (icon-1024). No change needed.")
elif b'app_logo_' in nib_data:
    # Restore to icon-1024 (same byte length: 9 chars each)
    nib_data = nib_data.replace(b'app_logo_', b'icon-1024')
    with open(nib_path, 'wb') as f:
        f.write(nib_data)
    print("  [OK] Restored LaunchScreen from app_logo_ -> icon-1024")
else:
    print("  [INFO] LaunchScreen has unknown image ref. Leaving as-is.")
print()


print("=" * 60)
print("STEP 5: Verify App Icons")
print("=" * 60)

for icon_name in ['AppIcon60x60@2x.png', 'AppIcon76x76@2x~ipad.png']:
    icon_path = os.path.join(APP, icon_name)
    if os.path.exists(icon_path):
        size = os.path.getsize(icon_path)
        print(f"  [OK] {icon_name} exists ({size} bytes) - keeping original ESign icon")
    else:
        print(f"  [WARN] {icon_name} missing!")
print()


print("=" * 60)
print("STEP 6: Final verification - search for ANY remaining khoindvn")
print("=" * 60)

# Check all text files
import subprocess
result = subprocess.run(
    ['grep', '-r', '-l', 'khoindvn', APP],
    capture_output=True, text=True
)
if result.stdout.strip():
    files = result.stdout.strip().split('\n')
    for f in files:
        # CodeResources will be regenerated by zsign, so it's fine
        if '_CodeSignature' in f:
            print(f"  [SKIP] {os.path.basename(f)} (will be regenerated by zsign)")
        else:
            print(f"  [WARN] Still contains khoindvn: {f}")
else:
    print("  [VERIFIED] No text files contain 'khoindvn'")

print()
print("=" * 60)
print("STEP 7: Repack to IPA template")
print("=" * 60)

template_out = '/home/pi/Downloads/CERTIOS.XYZ/server/templates/ESign_CERTIOS_TEMPLATE.ipa'
subprocess.run(
    f'cd "{WORK}" && zip -qr "{template_out}" Payload',
    shell=True, check=True
)
size_mb = os.path.getsize(template_out) / 1024 / 1024
print(f"  [OK] Created {template_out}")
print(f"  [OK] Size: {size_mb:.2f} MB")

print()
print("=" * 60)
print("ALL DONE! Template is ready.")
print("=" * 60)
