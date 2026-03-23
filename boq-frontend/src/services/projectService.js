/**
 * Project Service
 * Creates projects in Supabase and uploads the project file set to storage.
 */

import { supabase } from '../supabaseClient';
import {
  buildProjectInsertPayload,
  buildProjectUpdatePayload,
  normalizeProjectRecord,
} from '../lib/projectRecord';

const STORAGE_BUCKET = 'project-files';

function getMissingColumnFromError(error) {
  const fullMessage = [error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ');

  const patterns = [
    /Could not find the '([^']+)' column of 'projects'/i,
    /column\s+projects\.([a-zA-Z_][a-zA-Z0-9_]*)\s+does not exist/i,
    /column\s+"?projects"?\."?([a-zA-Z_][a-zA-Z0-9_]*)"?\s+does not exist/i,
  ];

  for (const pattern of patterns) {
    const match = fullMessage.match(pattern);
    if (match?.[1]) return match[1];
  }

  return '';
}

async function insertProjectWithSchemaFallback(payload) {
  const candidate = { ...payload };

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await supabase
      .from('projects')
      .insert(candidate)
      .select()
      .single();

    if (!error) {
      return { project: data, acceptedPayload: candidate };
    }

    const missingColumn = getMissingColumnFromError(error);
    if (missingColumn && missingColumn in candidate) {
      delete candidate[missingColumn];
      continue;
    }

    throw error;
  }

  throw new Error('Could not create project due to schema mismatch.');
}

async function updateProjectWithSchemaFallback(projectId, updates) {
  const candidate = { ...updates };

  while (Object.keys(candidate).length > 0) {
    const { data, error } = await supabase
      .from('projects')
      .update(candidate)
      .eq('id', projectId)
      .select()
      .single();

    if (!error) {
      return data;
    }

    const missingColumn = getMissingColumnFromError(error);
    if (missingColumn && missingColumn in candidate) {
      delete candidate[missingColumn];
      continue;
    }

    throw error;
  }

  const { data: freshProject, error: selectError } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single();

  if (selectError) throw selectError;
  return freshProject;
}

function getExtension(fileName = '') {
  const cleanName = String(fileName).trim();
  const ext = cleanName.includes('.') ? cleanName.split('.').pop() : '';
  return ext ? ext.toLowerCase() : 'bin';
}

function buildPath(userId, projectId, folder, fileName) {
  return `${userId}/${projectId}/${folder}.${getExtension(fileName)}`;
}

function buildIndexedPath(userId, projectId, folder, index, fileName) {
  return `${userId}/${projectId}/${folder}_${index}.${getExtension(fileName)}`;
}

async function uploadSingleFile(userId, projectId, file, folder) {
  if (!file) return null;

  const path = buildPath(userId, projectId, folder, file.name);
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, { upsert: true });

  if (error) {
    throw new Error(`Failed to upload ${file.name}: ${error.message}`);
  }

  return path;
}

async function uploadFileCollection(userId, projectId, files, folder) {
  if (!Array.isArray(files) || files.length === 0) return [];

  const uploaded = [];
  for (const [index, file] of files.entries()) {
    const path = buildIndexedPath(userId, projectId, folder, index + 1, file.name);
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, file, { upsert: true });

    if (error) {
      throw new Error(`Failed to upload ${file.name}: ${error.message}`);
    }

    uploaded.push(path);
  }

  return uploaded;
}

async function cleanupProject(projectId, uploadedPaths) {
  if (uploadedPaths.length > 0) {
    await supabase.storage.from(STORAGE_BUCKET).remove(uploadedPaths);
  }

  if (projectId) {
    await supabase.from('documents').delete().eq('project_id', projectId);
    await supabase.from('projects').delete().eq('id', projectId);
  }
}

function buildDocumentRecord(userId, projectId, folder, file, filePath) {
  return {
    user_id: userId,
    project_id: projectId,
    folder,
    name: file.name,
    file_path: filePath,
    file_type: getExtension(file.name),
    file_size: file.size || 0,
    uploaded_by: userId,
  };
}

async function insertProjectDocuments(records) {
  if (!records.length) return;

  const { error } = await supabase
    .from('documents')
    .insert(records);

  if (error) {
    throw new Error(`Failed to save project documents: ${error.message}`);
  }
}

/**
 * Create a new project and upload its files.
 *
 * `documents` may include:
 * - gi
 * - boq
 * - tender
 * - spec
 * - makes
 * - drawings[]
 * - additional[]
 */
export async function createProject(userId, projectInfo, documents = {}, options = {}) {
  if (!userId) {
    throw new Error('You must be signed in to create a project.');
  }

  const payload = buildProjectInsertPayload(userId, projectInfo, options);

  const { project } = await insertProjectWithSchemaFallback(payload);

  const projectId = project.id;
  const uploadedPaths = [];
  const documentRecords = [];

  try {
    const giPath = await uploadSingleFile(userId, projectId, documents.gi, 'general_info');
    const boqPath = await uploadSingleFile(userId, projectId, documents.boq, 'boq');
    const tenderPath = await uploadSingleFile(userId, projectId, documents.tender, 'tender');
    const specPath = await uploadSingleFile(userId, projectId, documents.spec, 'spec');
    const makesPath = await uploadSingleFile(userId, projectId, documents.makes, 'makes');
    const drawingPaths = await uploadFileCollection(userId, projectId, documents.drawings, 'drawing');
    const additionalPaths = await uploadFileCollection(userId, projectId, documents.additional, 'additional');

    [
      giPath,
      boqPath,
      tenderPath,
      specPath,
      makesPath,
      ...drawingPaths,
      ...additionalPaths,
    ].filter(Boolean).forEach((path) => uploadedPaths.push(path));

    if (giPath && documents.gi) documentRecords.push(buildDocumentRecord(userId, projectId, 'general_info', documents.gi, giPath));
    if (boqPath && documents.boq) documentRecords.push(buildDocumentRecord(userId, projectId, 'boq', documents.boq, boqPath));
    if (tenderPath && documents.tender) documentRecords.push(buildDocumentRecord(userId, projectId, 'tender', documents.tender, tenderPath));
    if (specPath && documents.spec) documentRecords.push(buildDocumentRecord(userId, projectId, 'spec', documents.spec, specPath));
    if (makesPath && documents.makes) documentRecords.push(buildDocumentRecord(userId, projectId, 'makes', documents.makes, makesPath));

    drawingPaths.forEach((path, index) => {
      const file = documents.drawings?.[index];
      if (file) documentRecords.push(buildDocumentRecord(userId, projectId, 'drawing', file, path));
    });

    additionalPaths.forEach((path, index) => {
      const file = documents.additional?.[index];
      if (file) documentRecords.push(buildDocumentRecord(userId, projectId, 'additional', file, path));
    });

    await insertProjectDocuments(documentRecords);

    let savedProject = normalizeProjectRecord(project);
    const filePaths = {
      general_info: giPath || savedProject.gi_file_path,
      boq: boqPath || savedProject.boq_file_path,
      tender: tenderPath || savedProject.tender_file_path,
      spec: specPath || savedProject.spec_file_path,
      makes: makesPath || savedProject.makes_file_path,
      drawings: drawingPaths,
      additional: additionalPaths,
    };

    const updates = buildProjectUpdatePayload(project, { file_paths: filePaths });
    if (Object.keys(updates).length > 0) {
      savedProject = normalizeProjectRecord(await updateProjectWithSchemaFallback(projectId, updates));
    }

    return {
      projectId,
      project: savedProject,
      uploadedFiles: {
        drawings: drawingPaths,
        additional: additionalPaths,
      },
    };
  } catch (uploadError) {
    await cleanupProject(projectId, uploadedPaths);
    throw uploadError;
  }
}

export async function getMyProjects(userId) {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((project) => normalizeProjectRecord(project));
}
