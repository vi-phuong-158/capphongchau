import pandas as pd
import json
import re
import os
import shutil
import sys

sys.stdout.reconfigure(encoding='utf-8')

# 1. PATH DEFINITIONS
workspace_dir = r"d:\04. Github\capphongchau"
original_excel_path = os.path.join(workspace_dir, "Tai lieu", "PHƯỜNG PHONG CHÂU - DS Tổng hợp Làm sạch CSDL đất đai 11-11-2025.xlsx")
backup_dir = os.path.join(workspace_dir, "Tai lieu", "backup")
os.makedirs(backup_dir, exist_ok=True)

backup_excel_path = os.path.join(backup_dir, "PHƯỜNG PHONG CHÂU - DS Tổng hợp Làm sạch CSDL đất đai 11-11-2025.ORIGINAL_BACKUP.xlsx")

scratch_dir = r"C:\Users\admin\.gemini\antigravity\brain\8147ef54-b556-4ddf-b290-9c5ef09edfe8\scratch"
os.makedirs(scratch_dir, exist_ok=True)

# 2. BACKUP ORIGINAL FILE
print(f"[STEP 1/5] Backing up original Excel to: {backup_excel_path}")
shutil.copy2(original_excel_path, backup_excel_path)

# Read raw excel completely
df_raw = pd.read_excel(original_excel_path, header=None)
print(f"Raw shape: {df_raw.shape}")

# Create raw backup JSON
raw_backup_data = []
for idx, row in df_raw.iterrows():
    raw_backup_data.append({
        "row_number": idx + 1,
        "cells": [str(x) if pd.notnull(x) else "" for x in row.values]
    })

raw_backup_json_path = os.path.join(scratch_dir, "legacy_raw_backup.json")
with open(raw_backup_json_path, "w", encoding="utf-8") as f:
    json.dump(raw_backup_data, f, ensure_ascii=False, indent=2)
print(f"Saved raw JSON backup ({len(raw_backup_data)} rows) to: {raw_backup_json_path}")

# 3. DATA CLEANING & NORMALIZATION HELPER FUNCTIONS

def clean_str(val):
    if pd.isnull(val) or val is None:
        return ""
    s = str(val).strip()
    if s.endswith(".0"):
        s = s[:-2]
    return "" if s in ["nan", "None", "0"] else s

def normalize_gender(raw_val):
    s = clean_str(raw_val).lower()
    if not s:
        return "", "MISSING"
    if s in ["nam"]:
        return "NAM", None
    if s in ["nữ", "nma", "nư", "nừ", "nu"]:
        return "NU", "GENDER_FIXED_SPELLING" if s != "nữ" else None
    return "UNKNOWN", f"GENDER_INVALID_VALUE: '{raw_val}'"

def normalize_identity(raw_val):
    s = clean_str(raw_val).replace(" ", "").replace(".", "")
    if not s:
        return "", "MISSING_IDENTITY", "MISSING"
    if re.match(r"^\d{12}$", s):
        return s, "VALID_CCCD_12", None
    if re.match(r"^\d{9}$", s):
        return s, "OLD_CMND_9", "NEEDS_UPGRADE_TO_CCCD_12"
    return s, "INVALID_FORMAT", f"IDENTITY_INVALID_FORMAT: '{raw_val}'"

def normalize_date(raw_val):
    s = clean_str(raw_val)
    if not s:
        return "", None
    
    # Check year 1017 anomaly
    change_note = None
    if "1017" in s:
        s = s.replace("1017", "2017")
        change_note = "DATE_YEAR_1017_FIXED_TO_2017"
    
    # ISO datetime string like 2003-09-10 00:00:00
    m_iso = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m_iso:
        y, m, d = m_iso.groups()
        return f"{d}/{m}/{y}", change_note
    
    # Slash or dot format DD/MM/YYYY or D/M/YYYY
    m_slash = re.match(r"^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$", s)
    if m_slash:
        d, m, y = m_slash.groups()
        return f"{d.zfill(2)}/{m.zfill(2)}/{y}", change_note

    return s, change_note

def normalize_area(raw_val):
    s = clean_str(raw_val)
    if not s:
        return "", None
    if "/" in s:
        try:
            num, den = s.split("/")
            calc_val = round(float(num) / float(den), 2)
            return str(calc_val), f"AREA_FRACTION_CALCULATED: '{s}' -> {calc_val}"
        except:
            pass
    s_clean = s.replace(",", ".")
    try:
        f_val = float(s_clean)
        return str(f_val), f"AREA_NORMALIZED_DECIMAL: '{s}' -> {f_val}" if "," in s else None
    except:
        return s, f"AREA_INVALID_NUMBER: '{raw_val}'"

def normalize_owner_type(raw_val):
    s = clean_str(raw_val)
    mapping = {
        "Cá nhân": "CA_NHAN",
        "Vợ chồng": "VO_CHONG",
        "Hộ gia đình": "HO_GIA_DINH",
        "Đồng sử dụng": "DONG_SU_DUNG",
        "Cộng đồng dân cư": "CONG_DONG_DAN_CU",
        "Tổ chức": "TO_CHUC"
    }
    return mapping.get(s, "CA_NHAN"), f"OWNER_TYPE_UNMAPPED: '{raw_val}'" if s not in mapping else None

def normalize_role(raw_val, owner_type):
    s = clean_str(raw_val)
    mapping = {
        "Cá nhân": "Cá nhân",
        "Chồng": "Chồng",
        "Vợ": "Vợ",
        "Chủ hộ": "Chủ hộ",
        "Thành viên": "Thành viên",
        "Người đại diện": "Người đại diện"
    }
    if s in mapping:
        return mapping[s], None
    if s == "Hộ gia đình":
        return "Chủ hộ", f"ROLE_SWAPPED_FIXED: 'Hộ gia đình' -> 'Chủ hộ'"
    return "Cá nhân", f"ROLE_UNMAPPED_DEFAULTED: '{raw_val}'"

# 4. EXECUTE CLEANING PIPELINE

data_rows = df_raw.iloc[3:].copy()

cleaned_records = []
exceptions_report = []
comparison_diffs = []

for row_idx, row in data_rows.iterrows():
    excel_row_num = row_idx + 1 # 1-based index in Excel
    changes = []

    raw_cells = [clean_str(x) for x in row.values]

    # Extract fields
    stt = raw_cells[0]
    ward_code = raw_cells[1] if raw_cells[1] else "07954"
    gcn_issue_num = raw_cells[2]
    raw_gcn_date = raw_cells[3]
    gcn_registry_num = raw_cells[4]
    
    org_name = raw_cells[5]
    org_tax_code = raw_cells[6]
    
    owner_name = raw_cells[7]
    raw_dob = raw_cells[8]
    raw_gender = raw_cells[9]
    raw_identity = raw_cells[10]
    residence_address = raw_cells[11]
    raw_owner_type = raw_cells[12]
    raw_role = raw_cells[13]

    current_user_name = raw_cells[14]
    current_user_identity = raw_cells[15]
    current_user_address = raw_cells[16]
    current_user_change_reason = raw_cells[17]

    parcel_id_code = raw_cells[18]
    map_sheet_gcn = raw_cells[19]
    parcel_num_gcn = raw_cells[20]
    map_sheet_cadastral = raw_cells[21]
    parcel_num_cadastral = raw_cells[22]
    parcel_address = raw_cells[23]
    raw_area = raw_cells[24]

    # Land use 1
    land_use_1_type = raw_cells[25]
    raw_land_use_1_area = raw_cells[26]
    land_use_1_origin = raw_cells[27]
    land_use_1_form = raw_cells[28]
    land_use_1_term = raw_cells[29]

    # Land use 2
    land_use_2_type = raw_cells[30]
    raw_land_use_2_area = raw_cells[31]
    land_use_2_origin = raw_cells[32]
    land_use_2_form = raw_cells[33]
    land_use_2_term = raw_cells[34]

    # Land use 3
    land_use_3_type = raw_cells[35]
    raw_land_use_3_area = raw_cells[36]
    land_use_3_origin = raw_cells[37]
    land_use_3_form = raw_cells[38]
    land_use_3_term = raw_cells[39]

    # Assets 40-48
    asset_type = raw_cells[40]

    # File scans col 49
    scan_files_raw = raw_cells[49]

    # --- NORMALIZATIONS ---
    # Gender
    gender, gender_note = normalize_gender(raw_gender)
    if gender_note:
        changes.append(gender_note)

    # Identity
    identity, identity_type, identity_note = normalize_identity(raw_identity)
    if identity_note:
        changes.append(identity_note)

    # Dates
    gcn_date, gcn_date_note = normalize_date(raw_gcn_date)
    if gcn_date_note:
        changes.append(f"GCN_DATE: {gcn_date_note}")

    dob, dob_note = normalize_date(raw_dob)
    if dob_note:
        changes.append(f"DOB: {dob_note}")

    # Area
    area, area_note = normalize_area(raw_area)
    if area_note:
        changes.append(area_note)

    land_use_1_area, lu1_note = normalize_area(raw_land_use_1_area)
    if lu1_note:
        changes.append(f"LAND_USE_1_{lu1_note}")

    # Owner Type & Role
    owner_type_code, owner_type_note = normalize_owner_type(raw_owner_type)
    if owner_type_note:
        changes.append(owner_type_note)

    role_on_cert, role_note = normalize_role(raw_role, owner_type_code)
    if role_note:
        changes.append(role_note)

    # Quality status determination
    if identity_type == "VALID_CCCD_12" and gcn_issue_num and owner_name:
        quality_status = "REUSABLE"
    elif identity_type == "OLD_CMND_9" or (gcn_issue_num and owner_name):
        quality_status = "DATA_ONLY"
    else:
        quality_status = "CONFLICT"

    cleaned_record = {
        "excel_row_number": excel_row_num,
        "quality_status": quality_status,
        "ward_code": ward_code,
        "certificate": {
            "issue_number": gcn_issue_num,
            "issue_date": gcn_date,
            "registry_number": gcn_registry_num
        },
        "organization": {
            "name": org_name,
            "tax_code": org_tax_code
        },
        "owner": {
            "full_name": owner_name,
            "date_of_birth": dob,
            "gender": gender,
            "identity_number": identity,
            "identity_type": identity_type,
            "residence_address": residence_address,
            "owner_type": owner_type_code,
            "role_on_certificate": role_on_cert
        },
        "current_user": {
            "full_name": current_user_name,
            "identity_number": current_user_identity,
            "residence_address": current_user_address,
            "change_reason": current_user_change_reason
        },
        "parcel": {
            "parcel_id_code": parcel_id_code,
            "map_sheet_gcn": map_sheet_gcn,
            "parcel_num_gcn": parcel_num_gcn,
            "map_sheet_cadastral": map_sheet_cadastral,
            "parcel_num_cadastral": parcel_num_cadastral,
            "address": parcel_address,
            "area_m2": area
        },
        "land_uses": [
            {
                "purpose": land_use_1_type,
                "area_m2": land_use_1_area,
                "origin": land_use_1_origin,
                "form": land_use_1_form,
                "term": land_use_1_term
            }
        ] if land_use_1_type else [],
        "scan_files": scan_files_raw
    }

    cleaned_records.append(cleaned_record)

    # Diff item
    if changes or quality_status != "REUSABLE":
        diff_item = {
            "excel_row_number": excel_row_num,
            "quality_status": quality_status,
            "owner_name": owner_name,
            "gcn_issue_number": gcn_issue_num,
            "changes_applied": changes,
        }
        comparison_diffs.append(diff_item)

    # Exception item
    if quality_status in ["DATA_ONLY", "CONFLICT"] or any("INVALID" in c for c in changes):
        exceptions_report.append({
            "excel_row_number": excel_row_num,
            "quality_status": quality_status,
            "owner_name": owner_name,
            "gcn_issue_number": gcn_issue_num,
            "identity_number": identity,
            "identity_type": identity_type,
            "issues": changes if changes else ["MISSING_CRITICAL_IDENTIFIER"]
        })

# 5. WRITE OUTPUT ARTIFACTS
cleaned_records_path = os.path.join(scratch_dir, "legacy_cleaned_records.json")
with open(cleaned_records_path, "w", encoding="utf-8") as f:
    json.dump(cleaned_records, f, ensure_ascii=False, indent=2)

exceptions_report_path = os.path.join(scratch_dir, "legacy_data_exceptions_report.json")
with open(exceptions_report_path, "w", encoding="utf-8") as f:
    json.dump(exceptions_report, f, ensure_ascii=False, indent=2)

comparison_diff_path = os.path.join(scratch_dir, "legacy_comparison_diff.json")
with open(comparison_diff_path, "w", encoding="utf-8") as f:
    json.dump(comparison_diffs, f, ensure_ascii=False, indent=2)

print("\n--- PIPELINE EXECUTION COMPLETE ---")
print(f"1. Raw Backup Excel: {backup_excel_path}")
print(f"2. Raw Backup JSON: {raw_backup_json_path}")
print(f"3. Cleaned Records JSON ({len(cleaned_records)} records): {cleaned_records_path}")
print(f"4. Comparison Diff JSON ({len(comparison_diffs)} rows modified/flagged): {comparison_diff_path}")
print(f"5. Exceptions Report JSON ({len(exceptions_report)} issues): {exceptions_report_path}")

# Summary Stats
reusable_cnt = sum(1 for r in cleaned_records if r["quality_status"] == "REUSABLE")
data_only_cnt = sum(1 for r in cleaned_records if r["quality_status"] == "DATA_ONLY")
conflict_cnt = sum(1 for r in cleaned_records if r["quality_status"] == "CONFLICT")

print(f"\nSummary Quality Breakdown:")
print(f" - REUSABLE (Ready for auto-linking): {reusable_cnt}")
print(f" - DATA_ONLY (Text ready, needs CMND upgrade/scan verified): {data_only_cnt}")
print(f" - CONFLICT/INVALID (Needs ward officer manual review): {conflict_cnt}")
