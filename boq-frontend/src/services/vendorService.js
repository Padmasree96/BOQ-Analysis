/**
 * Vendor Service
 * Supabase-backed vendor CRUD and xlsx helpers for per-user vendor lists.
 */

import { supabase } from '../supabaseClient';
import * as XLSX from 'xlsx';

const LOCAL_VENDOR_KEY_PREFIX = 'flyyai.local.vendors.';
const OWNER_COLUMNS = ['user_id', 'owner_id', 'workspace_owner_id'];
const PRIMARY_KEY_COLUMNS = ['id', 'vendor_id', 'uuid'];

let cachedVendorOwnerColumn = '';
// The current Supabase vendors table does not match the app schema, so prefer
// the local fallback until the table is repaired.
let vendorRemoteDisabled = true;

function getMissingColumnFromError(error) {
  const fullMessage = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ');

  const patterns = [
    /Could not find the '([^']+)' column of 'vendors'/i,
    /column\s+vendors\.([a-zA-Z_][a-zA-Z0-9_]*)\s+does not exist/i,
    /column\s+"?vendors"?\."?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+does not exist/i,
  ];

  for (const pattern of patterns) {
    const match = fullMessage.match(pattern);
    if (match?.[1]) return match[1];
  }

  return '';
}

function isVendorSchemaError(error) {
  const fullMessage = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ');

  return /vendors table schema is incomplete/i.test(fullMessage)
    || /column\s+vendors\./i.test(fullMessage)
    || /Could not find the '.*' column of 'vendors'/i.test(fullMessage);
}

function disableRemoteVendors() {
  vendorRemoteDisabled = true;
}

async function probeVendorOwnerColumn(userId) {
  if (vendorRemoteDisabled) return '';
  if (cachedVendorOwnerColumn) return cachedVendorOwnerColumn;

  for (const ownerColumn of OWNER_COLUMNS) {
    const { error } = await supabase
      .from('vendors')
      .select('*')
      .eq(ownerColumn, userId)
      .limit(1);

    if (!error) {
      cachedVendorOwnerColumn = ownerColumn;
      return ownerColumn;
    }

    const missingColumn = getMissingColumnFromError(error);
    if (missingColumn && missingColumn === ownerColumn) {
      continue;
    }

    throw error;
  }

  disableRemoteVendors();
  return '';
}

function hasLocalStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getLocalVendorStorageKey(userId) {
  return `${LOCAL_VENDOR_KEY_PREFIX}${userId}`;
}

function generateVendorId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `vendor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readLocalVendors(userId) {
  if (!hasLocalStorage() || !userId) return [];

  try {
    const raw = window.localStorage.getItem(getLocalVendorStorageKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalVendors(userId, vendors) {
  if (!hasLocalStorage() || !userId) return;
  window.localStorage.setItem(getLocalVendorStorageKey(userId), JSON.stringify(vendors));
}

function updateLocalVendor(userId, vendorId, updates) {
  const current = readLocalVendors(userId);
  const next = current.map((vendor) => (
    vendor?.id === vendorId
      ? { ...vendor, ...updates, id: vendorId }
      : vendor
  ));
  writeLocalVendors(userId, next);
  return next.find((vendor) => vendor?.id === vendorId) || null;
}

function upsertLocalVendors(userId, vendors) {
  const current = readLocalVendors(userId);
  // Deduplicate by email first, then merge by id
  const byEmail = new Map();
  const byId = new Map();

  current.forEach((vendor) => {
    const email = (vendor.email || '').toLowerCase().trim();
    if (email && byEmail.has(email)) return; // skip duplicate emails
    if (email) byEmail.set(email, vendor.id);
    byId.set(vendor.id, vendor);
  });

  vendors.forEach((vendor) => {
    const email = (vendor.email || '').toLowerCase().trim();
    if (email && byEmail.has(email)) {
      // Update existing vendor with same email instead of adding new
      const existingId = byEmail.get(email);
      byId.set(existingId, { ...vendor, id: existingId });
    } else {
      if (email) byEmail.set(email, vendor.id);
      byId.set(vendor.id, vendor);
    }
  });

  const merged = Array.from(byId.values());
  writeLocalVendors(userId, merged);
  return merged;
}

function deleteLocalVendorById(vendorId) {
  if (!hasLocalStorage()) return false;

  const keysToCheck = Object.keys(window.localStorage)
    .filter((key) => key.startsWith(LOCAL_VENDOR_KEY_PREFIX));

  let deleted = false;
  keysToCheck.forEach((storageKey) => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return;

      const next = parsed.filter((vendor) => vendor?.id !== vendorId);
      if (next.length !== parsed.length) {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
        deleted = true;
      }
    } catch {
      // Ignore malformed local cache entries.
    }
  });

  return deleted;
}

function normalizeHeader(key = '') {
  return String(key).toLowerCase().replace(/[\s_\-.]/g, '');
}

function getColumnValue(row, columnMap, aliases) {
  for (const alias of aliases) {
    const actualKey = columnMap[normalizeHeader(alias)];
    if (actualKey && row[actualKey] != null && String(row[actualKey]).trim()) {
      return String(row[actualKey]).trim();
    }
  }

  return '';
}

function normalizeCategories(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value)
    .split(/[;,/]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeVendorRecord(record = {}, index = 0) {
  const companyName = record.company_name || record.company || record.name || record.vendor_name || '';
  const contactPerson = record.contact_person || record.contact_name || record.person || '';
  const rowId =
    record.id ||
    record.vendor_id ||
    record.uuid ||
    `${companyName || 'vendor'}-${record.email || 'no-email'}-${index}`;

  return {
    ...record,
    id: rowId,
    company_name: companyName,
    contact_person: contactPerson,
    categories: normalizeCategories(record.categories ?? record.category ?? record.trade),
    status: record.status || (record.is_active === false ? 'inactive' : 'active'),
  };
}

function hasUsableVendorShape(record = {}) {
  const normalized = normalizeVendorRecord(record);
  return Boolean(
    normalized.id
    && (
      normalized.company_name
      || normalized.contact_person
      || normalized.email
      || normalized.phone
      || normalized.location
    )
  );
}

function sortVendors(vendors = []) {
  return [...vendors].sort((a, b) => {
    const aName = (a.company_name || '').toLowerCase();
    const bName = (b.company_name || '').toLowerCase();
    if (aName < bName) return -1;
    if (aName > bName) return 1;
    return 0;
  });
}

function filterVendorsForOwner(records = [], userId) {
  return records.filter((record) => {
    const ownerId = record.user_id || record.owner_id || record.workspace_owner_id;
    return !ownerId || ownerId === userId;
  });
}

async function insertVendorsWithSchemaFallback(records) {
  if (vendorRemoteDisabled) {
    throw new Error('The vendors table schema is incomplete. Add vendor columns in Supabase first.');
  }

  const candidateRecords = records.map((record) => ({ ...record }));

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!candidateRecords.some((record) => Object.keys(record).length > 0)) {
      throw new Error('The vendors table schema is incomplete. Add vendor columns in Supabase first.');
    }

    const { data, error } = await supabase
      .from('vendors')
      .insert(candidateRecords)
      .select();

    if (!error) return data || [];

    const missingColumn = getMissingColumnFromError(error);
    if (missingColumn && candidateRecords.every((record) => missingColumn in record)) {
      candidateRecords.forEach((record) => {
        delete record[missingColumn];
      });
      continue;
    }

    throw error;
  }

  throw new Error('Could not save vendors due to schema mismatch.');
}

async function selectVendorsWithOwnerFallback(userId) {
  if (vendorRemoteDisabled) {
    return [];
  }

  const ownerColumn = await probeVendorOwnerColumn(userId);
  if (!ownerColumn) {
    return [];
  }

  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq(ownerColumn, userId);

  if (error) throw error;
  return data || [];
}

/** Deduplicate vendors by email, keeping the first occurrence */
function deduplicateByEmail(vendors) {
  const seen = new Set();
  return vendors.filter((v) => {
    const email = (v.email || '').toLowerCase().trim();
    if (!email) return true; // keep vendors without email
    if (seen.has(email)) return false;
    seen.add(email);
    return true;
  });
}

export async function getMyVendors(userId) {
  const localVendors = readLocalVendors(userId).map((record, index) => normalizeVendorRecord(record, index));

  try {
    const data = await selectVendorsWithOwnerFallback(userId);
    const scopedData = filterVendorsForOwner(data, userId);
    const remoteVendors = scopedData
      .filter((record) => hasUsableVendorShape(record))
      .map((record, index) => normalizeVendorRecord(record, index));

    if (!remoteVendors.length) {
      return sortVendors(deduplicateByEmail(localVendors));
    }

    const merged = [...remoteVendors];
    localVendors.forEach((vendor) => {
      if (!merged.some((item) => item.id === vendor.id)) {
        merged.push(vendor);
      }
    });

    return sortVendors(deduplicateByEmail(merged));
  } catch (error) {
    if (isVendorSchemaError(error)) {
      return sortVendors(deduplicateByEmail(localVendors));
    }

    throw error;
  }
}

export async function addVendorManually(userId, vendorData) {
  const payload = {
      user_id: userId,
      company_name: vendorData.company_name,
      contact_person: vendorData.contact_person,
      email: vendorData.email,
      phone: vendorData.phone || '',
      location: vendorData.location || '',
      categories: vendorData.categories || [],
      status: 'active',
    };

  try {
    const inserted = await insertVendorsWithSchemaFallback([payload]);
    return normalizeVendorRecord(inserted[0], 0);
  } catch (error) {
    if (!isVendorSchemaError(error)) throw error;
    disableRemoteVendors();

    const localVendor = normalizeVendorRecord({
      ...payload,
      id: generateVendorId(),
      local_only: true,
    }, 0);

    upsertLocalVendors(userId, [localVendor]);
    return localVendor;
  }
}

export async function updateVendorRecord(userId, vendorId, updates) {
  if (!userId || !vendorId) {
    throw new Error('User and vendor id are required to update a vendor.');
  }

  if (vendorRemoteDisabled) {
    const updated = updateLocalVendor(userId, vendorId, updates);
    if (!updated) throw new Error('Vendor not found.');
    return normalizeVendorRecord(updated, 0);
  }

  for (const keyColumn of PRIMARY_KEY_COLUMNS) {
    const payload = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('vendors')
      .update(payload)
      .eq(keyColumn, vendorId)
      .select()
      .single();

    if (!error) return normalizeVendorRecord(data, 0);

    const missingColumn = getMissingColumnFromError(error);
    if (missingColumn && missingColumn === keyColumn) {
      continue;
    }

    if (isVendorSchemaError(error)) {
      disableRemoteVendors();
      const updated = updateLocalVendor(userId, vendorId, updates);
      if (!updated) throw new Error('Vendor not found.');
      return normalizeVendorRecord(updated, 0);
    }

    throw error;
  }

  disableRemoteVendors();
  const updated = updateLocalVendor(userId, vendorId, updates);
  if (!updated) throw new Error('Vendor not found.');
  return normalizeVendorRecord(updated, 0);
}

export async function bulkAddVendors(userId, file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  if (!rows.length) {
    return { added: 0, skipped: 0, errors: ['No rows found in spreadsheet'] };
  }

  const columnMap = {};
  Object.keys(rows[0]).forEach((key) => {
    columnMap[normalizeHeader(key)] = key;
  });

  // Load existing vendors to deduplicate by email
  const existingVendors = readLocalVendors(userId);
  const existingEmails = new Set(
    existingVendors.map((v) => (v.email || '').toLowerCase().trim()).filter(Boolean)
  );

  const records = [];
  const rowErrors = [];
  const seenEmails = new Set();
  let duplicateCount = 0;

  for (const [index, row] of rows.entries()) {
    const companyName = getColumnValue(row, columnMap, [
      'Company Name', 'CompanyName', 'Vendor', 'Name', 'Firm',
    ]);
    const email = getColumnValue(row, columnMap, [
      'Email', 'Email Address', 'EmailAddress', 'Mail', 'E-mail',
    ]);

    if (!companyName) {
      rowErrors.push(`Row ${index + 2}: missing company name`);
      continue;
    }

    if (!email) {
      rowErrors.push(`Row ${index + 2}: missing email for "${companyName}"`);
      continue;
    }

    const emailLower = email.toLowerCase().trim();

    // Skip duplicates within the file
    if (seenEmails.has(emailLower)) {
      duplicateCount += 1;
      continue;
    }

    // Skip if already exists in vendor list
    if (existingEmails.has(emailLower)) {
      duplicateCount += 1;
      continue;
    }

    seenEmails.add(emailLower);

    records.push({
      user_id: userId,
      company_name: companyName,
      contact_person: getColumnValue(row, columnMap, [
        'Contact Person', 'ContactPerson', 'Contact', 'Person',
      ]),
      email,
      phone: getColumnValue(row, columnMap, [
        'Phone', 'Mobile', 'Tel', 'Telephone',
      ]),
      location: getColumnValue(row, columnMap, [
        'Location', 'City', 'Address', 'Place',
      ]),
      categories: normalizeCategories(getColumnValue(row, columnMap, [
        'Category', 'Categories', 'Type', 'Trade',
      ])),
      status: 'active',
    });
  }

  if (duplicateCount > 0) {
    rowErrors.push(`${duplicateCount} duplicate vendor(s) skipped`);
  }

  if (!records.length) {
    return { added: 0, skipped: rows.length, errors: rowErrors };
  }

  let inserted = [];
  try {
    inserted = await insertVendorsWithSchemaFallback(records);
  } catch (error) {
    if (isVendorSchemaError(error)) {
      disableRemoteVendors();
      const localRecords = records.map((record, index) => normalizeVendorRecord({
        ...record,
        id: generateVendorId(),
        local_only: true,
      }, index));
      upsertLocalVendors(userId, localRecords);

      return {
        added: localRecords.length,
        skipped: rows.length - localRecords.length,
        errors: rowErrors,
      };
    }

    return {
      added: 0,
      skipped: rows.length,
      errors: [...rowErrors, error.message],
    };
  }

  const added = inserted?.length || 0;
  const skipped = rows.length - added;

  return {
    added,
    skipped,
    errors: rowErrors,
  };
}

export async function deleteVendor(vendorId) {
  if (deleteLocalVendorById(vendorId)) {
    return;
  }

  if (vendorRemoteDisabled) {
    throw new Error('Could not delete vendor because a primary key column is missing.');
  }

  for (const keyColumn of PRIMARY_KEY_COLUMNS) {
    const { error } = await supabase
      .from('vendors')
      .delete()
      .eq(keyColumn, vendorId);

    if (!error) return;

    const missingColumn = getMissingColumnFromError(error);
    if (missingColumn && missingColumn === keyColumn) {
      continue;
    }

    throw error;
  }

  disableRemoteVendors();
  throw new Error('Could not delete vendor because a primary key column is missing.');
}

export function downloadVendorTemplate() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['Company Name', 'Contact Person', 'Email', 'Phone', 'Location', 'Category'],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Vendors');
  XLSX.writeFile(workbook, 'vendor_template.xlsx');
}

export async function previewVendorFile(file) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

  return {
    preview: rows.slice(0, 5),
    total: rows.length,
    columns: rows.length > 0 ? Object.keys(rows[0]) : [],
  };
}
