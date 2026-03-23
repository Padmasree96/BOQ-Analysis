import { useState, useRef, useId, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  X,
  FileSearch,
  ArrowRight,
  ArrowLeft,
  Pencil,
  Check,
  Loader2,
  FileSpreadsheet,
  Layers,
  CheckCircle2,
  Settings2,
  Upload,
  AlertTriangle,
  Rocket,
  Save,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { extractGeneralInfo } from '../../services/giExtractor';
import { createProject } from '../../services/projectService';
import { scaleInVariants } from '../../lib/motion';

gsap.registerPlugin(useGSAP);

const STEPS = [
  { key: 'gi_upload', label: 'General Info' },
  { key: 'project_form', label: 'Auto-fill' },
  { key: 'documents', label: 'Files' },
  { key: 'done', label: 'Done' },
];

const PROJECT_TYPES = [
  'Hospital',
  'Office',
  'Residential',
  'Industrial',
  'Government',
  'Educational',
  'Infrastructure',
  'Mixed Use',
  'Other',
];

const CURRENCIES = ['INR', 'USD', 'AED', 'SAR'];

const EMPTY_PROJECT_INFO = {
  project_name: '',
  client_name: '',
  project_type: '',
  location: '',
  estimated_value: '',
  currency: 'INR',
  deadline: '',
  description: '',
  contact_person: '',
  contact_email: '',
  tender_number: '',
};

const DOC_ZONES = [
  {
    key: 'boq',
    label: 'BOQ Excel File',
    hint: '.xlsx, .xls, .xlsm',
    accept: '.xlsx,.xls,.xlsm',
    icon: FileSpreadsheet,
    background: '#F0FDF4',
    border: '#16A34A',
    iconClass: 'text-green-600',
    multi: false,
    requiredForExtract: true,
  },
  {
    key: 'spec',
    label: 'Technical Specs / Tender PDF',
    hint: '.pdf, .doc, .docx, .ppt, .pptx',
    accept: '.pdf,.doc,.docx,.ppt,.pptx',
    icon: Settings2,
    background: '#FFFBEB',
    border: '#F59E0B',
    iconClass: 'text-amber-600',
    multi: false,
  },
  {
    key: 'drawings',
    label: 'CAD / Drawings',
    hint: '.dwg, .dxf, .pdf',
    accept: '.dwg,.dxf,.pdf',
    icon: Layers,
    background: '#FAF5FF',
    border: '#7C3AED',
    iconClass: 'text-violet-600',
    multi: true,
  },
];

const EXTRACT_PHASES = [
  'Reading document...',
  'Extracting project details...',
  'Almost done...',
];

function normalizeDate(value = '') {
  if (!value) return '';

  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  const isoMatch = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}`;
  }

  const dmyMatch = text.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }

  return '';
}

function normalizeProjectType(value = '') {
  if (!value) return '';
  return PROJECT_TYPES.includes(value) ? value : 'Other';
}

function normalizeProjectInfo(info = {}) {
  return {
    ...EMPTY_PROJECT_INFO,
    ...info,
    project_type: normalizeProjectType(info.project_type),
    estimated_value: info.estimated_value
      ? String(info.estimated_value).replace(/[^\d.]/g, '')
      : '',
    deadline: normalizeDate(info.deadline),
    currency: info.currency || 'INR',
  };
}

function hasExtractedDetails(info) {
  return Boolean(
    info.project_name ||
    info.client_name ||
    info.location ||
    info.description ||
    info.tender_number ||
    info.contact_email
  );
}

function matchesAcceptedFile(file, accept) {
  if (!file || accept === '*') return true;
  const lowerName = file.name.toLowerCase().trim();
  return accept
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .some((extension) => lowerName.endsWith(extension));
}

function formatFileSize(bytes = 0) {
  if (!bytes) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileKey(file, index) {
  return `${file.name}-${file.lastModified}-${index}`;
}

function formatValue(value, fallback = 'Not provided') {
  if (!value) return fallback;
  return String(value);
}

export default function CreateProjectFlow({ onComplete, onCancel, userId }) {
  const [step, setStep] = useState('gi_upload');
  const [giFile, setGiFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [extractPhase, setExtractPhase] = useState(0);
  const [projectInfo, setProjectInfo] = useState(EMPTY_PROJECT_INFO);
  const [extractedFromPdf, setExtractedFromPdf] = useState(false);
  const [editMode, setEditMode] = useState(true);
  const [documents, setDocuments] = useState({
    boq: null,
    spec: null,
    drawings: [],
  });
  const [errors, setErrors] = useState({});
  const [documentError, setDocumentError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMode, setSaveMode] = useState('create');
  const [createdProject, setCreatedProject] = useState(null);

  const panelRef = useRef(null);
  const dotsRef = useRef(null);
  const extractTextRef = useRef(null);
  const extractTimerRef = useRef(null);

  const stepIndex = STEPS.findIndex((item) => item.key === step);

  const goToStep = useCallback((nextStep) => {
    if (step === nextStep) return;

    if (!panelRef.current) {
      setStep(nextStep);
      return;
    }

    const timeline = gsap.timeline();
    timeline
      .to(panelRef.current, { x: -60, opacity: 0, duration: 0.3, ease: 'power2.in' })
      .call(() => setStep(nextStep))
      .fromTo(
        panelRef.current,
        { x: 60, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.35, ease: 'power2.out' }
      );
  }, [step]);

  useGSAP(() => {
    if (!extracting || !dotsRef.current) return;

    const dots = dotsRef.current.querySelectorAll('.loading-dot');
    if (!dots.length) return;

    gsap.to(dots, {
      y: -6,
      stagger: 0.15,
      repeat: -1,
      yoyo: true,
      duration: 0.4,
      ease: 'sine.inOut',
    });
  }, { scope: dotsRef, dependencies: [extracting] });

  useGSAP(() => {
    if (!extractTextRef.current || !extracting) return;

    gsap.fromTo(
      extractTextRef.current,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' }
    );
  }, { scope: extractTextRef, dependencies: [extractPhase, extracting] });

  useEffect(() => {
    if (!extracting) {
      clearInterval(extractTimerRef.current);
      return undefined;
    }

    setExtractPhase(0);
    extractTimerRef.current = setInterval(() => {
      setExtractPhase((current) => Math.min(current + 1, EXTRACT_PHASES.length - 1));
    }, 1800);

    return () => clearInterval(extractTimerRef.current);
  }, [extracting]);

  const updateField = (key, value) => {
    setProjectInfo((current) => ({ ...current, [key]: value }));
    if (errors[key]) {
      setErrors((current) => {
        const nextErrors = { ...current };
        delete nextErrors[key];
        return nextErrors;
      });
    }
  };

  const setSingleDocument = (key, file) => {
    setDocuments((current) => ({ ...current, [key]: file }));
    if (key === 'boq') setDocumentError('');
  };

  const addMultiDocuments = (key, files) => {
    setDocuments((current) => ({ ...current, [key]: [...current[key], ...files] }));
  };

  const removeSingleDocument = (key) => {
    setDocuments((current) => ({ ...current, [key]: null }));
  };

  const removeMultiDocument = (key, index) => {
    setDocuments((current) => ({
      ...current,
      [key]: current[key].filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const validateForm = useCallback(() => {
    const nextErrors = {};

    if (!projectInfo.project_name.trim()) nextErrors.project_name = 'Project name is required';
    if (!projectInfo.client_name.trim()) nextErrors.client_name = 'Client name is required';
    if (!projectInfo.project_type) nextErrors.project_type = 'Select a project type';
    if (!projectInfo.location.trim()) nextErrors.location = 'Location is required';
    if (!projectInfo.description.trim()) nextErrors.description = 'Description is required';

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }, [projectInfo]);

  const validateDocuments = (withExtraction) => {
    if (withExtraction && !documents.boq) {
      setDocumentError('Upload a BOQ Excel file to create the project and start extraction immediately.');
      return false;
    }

    setDocumentError('');
    return true;
  };

  const handleGiFile = async (file) => {
    if (!file) return;
    if (!matchesAcceptedFile(file, '.pdf')) {
      toast.error('Please upload a PDF file.');
      return;
    }

    setGiFile(file);
    setExtractError('');
    setExtracting(true);

    try {
      const extracted = await extractGeneralInfo(file);
      const normalized = normalizeProjectInfo(extracted);
      const hasDetails = hasExtractedDetails(normalized);

      setProjectInfo(normalized);
      setExtractedFromPdf(hasDetails);
      setEditMode(!hasDetails);

      if (!hasDetails) {
        toast('No structured details were found. Fill the form manually.');
      }

      goToStep('project_form');
    } catch (error) {
      setExtractError(error.message || 'Could not extract details from this file.');
    } finally {
      setExtracting(false);
    }
  };

  const handleContinueToDocuments = () => {
    if (!validateForm()) {
      toast.error('Please fill the required project details.');
      return;
    }

    goToStep('documents');
  };

  const handleSave = async (withExtraction) => {
    if (!validateForm()) {
      goToStep('project_form');
      toast.error('Please fill the required project details.');
      return;
    }

    if (!validateDocuments(withExtraction)) {
      toast.error('A BOQ Excel file is required for immediate extraction.');
      return;
    }

    setSaving(true);
    setSaveMode(withExtraction ? 'create_extract' : 'create');

    try {
      const result = await createProject(
        userId,
        projectInfo,
        { ...documents, gi: giFile },
        { extractionRequested: withExtraction }
      );

      setCreatedProject({ ...result, withExtraction });
      toast.success(withExtraction ? 'Project created and queued for extraction.' : 'Project created successfully.');
      goToStep('done');
    } catch (error) {
      toast.error(error.message || 'Failed to create project.');
    } finally {
      setSaving(false);
    }
  };

  const finishFlow = (next) => {
    if (!createdProject) return;

    onComplete?.({
      projectId: createdProject.projectId,
      project: createdProject.project,
      withExtraction: createdProject.withExtraction,
      next,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto px-4 py-8">
      <motion.div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => !saving && onCancel?.()}
      />

      <motion.div
        variants={scaleInVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        className="relative z-10 w-full max-w-3xl overflow-hidden rounded-[24px] bg-white shadow-2xl"
      >
        <div className="sticky top-0 z-20 flex items-center justify-between border-b border-slate-100 bg-white px-6 py-4">
          <div className="flex items-center gap-3 overflow-x-auto">
            {STEPS.map((item, index) => {
              const state = index < stepIndex ? 'done' : index === stepIndex ? 'active' : 'upcoming';

              return (
                <div key={item.key} className="flex items-center gap-3 whitespace-nowrap">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      state === 'done'
                        ? 'bg-green-100 text-green-700'
                        : state === 'active'
                          ? 'bg-green-600 text-white'
                          : 'bg-slate-100 text-slate-400'
                    }`}
                  >
                    {state === 'done' ? <Check size={14} /> : index + 1}
                  </div>
                  <span className={`text-sm font-medium ${state === 'active' ? 'text-slate-800' : 'text-slate-400'}`}>
                    {item.label}
                  </span>
                  {index < STEPS.length - 1 && <div className="hidden h-px w-7 bg-slate-200 sm:block" />}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => !saving && onCancel?.()}
            disabled={saving}
            className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <div ref={panelRef} className="max-h-[70vh] overflow-y-auto px-6 py-6">
          {step === 'gi_upload' && (
            <GiUploadStep
              giFile={giFile}
              extracting={extracting}
              extractError={extractError}
              extractPhase={extractPhase}
              dotsRef={dotsRef}
              extractTextRef={extractTextRef}
              onFile={handleGiFile}
              onSkip={() => {
                setExtractedFromPdf(false);
                setEditMode(true);
                goToStep('project_form');
              }}
              onRetry={() => {
                setGiFile(null);
                setExtractError('');
              }}
            />
          )}

          {step === 'project_form' && (
            <ProjectFormStep
              projectInfo={projectInfo}
              errors={errors}
              editMode={editMode}
              autoFilled={extractedFromPdf}
              onToggleEdit={() => setEditMode((current) => !current)}
              onUpdate={updateField}
            />
          )}

          {step === 'documents' && (
            <DocumentsStep
              documents={documents}
              documentError={documentError}
              onSetDoc={setSingleDocument}
              onAddMulti={addMultiDocuments}
              onRemoveSingle={removeSingleDocument}
              onRemoveMulti={removeMultiDocument}
            />
          )}

          {step === 'done' && createdProject && (
            <CompletedStep
              project={createdProject.project}
              saveMode={saveMode}
              onOpenProject={() => finishFlow('project')}
              onAddVendors={() => finishFlow('vendors')}
            />
          )}
        </div>
 
        {step !== 'done' && (
          <div className="sticky bottom-0 flex items-center justify-between border-t border-slate-100 bg-white px-6 py-4">
            <div>
              {step === 'gi_upload' && (
                <button
                  type="button"
                  onClick={() => {
                    setExtractedFromPdf(false);
                    setEditMode(true);
                    goToStep('project_form');
                  }}
                  className="text-sm text-slate-500 transition hover:text-slate-700"
                >
                  Skip - I&apos;ll fill manually
                </button>
              )}

              {step === 'project_form' && (
                <button
                  type="button"
                  onClick={() => goToStep('gi_upload')}
                  className="flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-700"
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              )}

              {step === 'documents' && (
                <button
                  type="button"
                  onClick={() => goToStep('project_form')}
                  className="flex items-center gap-2 text-sm text-slate-500 transition hover:text-slate-700"
                >
                  <ArrowLeft size={16} />
                  Back
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {step === 'project_form' && (
                <button type="button" onClick={handleContinueToDocuments} className="btn-primary flex items-center gap-2 text-sm">
                  Continue
                  <ArrowRight size={14} />
                </button>
              )}

              {step === 'documents' && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSave(false)}
                    disabled={saving}
                    className="btn-secondary flex items-center gap-2 text-sm"
                  >
                    {saving && saveMode === 'create' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Create Project
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSave(true)}
                    disabled={saving}
                    className="btn-primary flex items-center gap-2 text-sm"
                  >
                    {saving && saveMode === 'create_extract' ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />}
                    Create Project &amp; Extract
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function GiUploadStep({
  giFile,
  extracting,
  extractError,
  extractPhase,
  dotsRef,
  extractTextRef,
  onFile,
  onSkip,
  onRetry,
}) {
  const inputId = useId();
  const zoneRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!zoneRef.current) return;

    gsap.to(zoneRef.current, {
      scale: dragging ? 1.02 : 1,
      duration: 0.2,
      ease: 'power2.out',
    });
  }, [dragging]);

  const acceptFile = (file) => {
    if (!file) return;
    if (!matchesAcceptedFile(file, '.pdf')) {
      toast.error('Please upload a PDF file.');
      return;
    }

    if (zoneRef.current) {
      gsap.timeline()
        .to(zoneRef.current, { scale: 1.03, duration: 0.12 })
        .to(zoneRef.current, { scale: 1, duration: 0.18, ease: 'back.out(1.4)' });
    }

    onFile(file);
  };

  if (extracting) {
    return (
      <div className="py-16 text-center">
        <div ref={dotsRef} className="mb-6 flex items-center justify-center gap-2">
          {[0, 1, 2].map((index) => (
            <div key={index} className="loading-dot h-3 w-3 rounded-full bg-teal-500" />
          ))}
        </div>

        <div ref={extractTextRef} className="space-y-2">
          <p className="text-lg font-semibold text-slate-800">{EXTRACT_PHASES[extractPhase]}</p>
          {giFile && <p className="text-sm text-slate-400">{giFile.name}</p>}
        </div>
      </div>
    );
  }

  if (extractError) {
    return (
      <div className="space-y-5 py-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
          <AlertTriangle size={28} className="text-red-600" />
        </div>
        <div className="space-y-2">
          <p className="text-lg font-semibold text-slate-800">Could not extract details from this file</p>
          <p className="text-sm text-slate-500">{extractError}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button type="button" onClick={onRetry} className="btn-secondary text-sm">
            Retry
          </button>
          <button type="button" onClick={onSkip} className="btn-primary text-sm">
            Try manually filling the form
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-900">Upload General Information</h2>
        <p className="mt-2 text-sm text-slate-500">Upload your project PDF to auto-fill all details</p>
      </div>

      <input
        id={inputId}
        type="file"
        accept=".pdf"
        className="sr-only"
        onChange={(event) => {
          acceptFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />

      <label
        ref={zoneRef}
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          acceptFile(event.dataTransfer.files?.[0]);
        }}
        className="block cursor-pointer rounded-[24px] border-2 border-dashed p-12 text-center transition-colors"
        style={{ background: dragging ? '#F0FDFA' : '#EAF6FF', borderColor: '#0D9488' }}
      >
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/70">
          <FileSearch size={30} className="text-teal-600" />
        </div>
        <p className="text-xl font-semibold text-slate-800">Drop your project PDF here</p>
        <p className="mt-2 text-sm text-slate-500">.pdf - tender notice, NIT, general info document</p>
        <span className="mt-6 inline-flex items-center rounded-xl bg-teal-600 px-4 py-2 text-sm font-semibold text-white">
          Browse PDF
        </span>
      </label>
    </div>
  );
}

function ProjectFormStep({ projectInfo, errors, editMode, autoFilled, onToggleEdit, onUpdate }) {
  const fieldsRef = useRef(null);
  const showReadOnly = autoFilled && !editMode;

  useGSAP(() => {
    if (!fieldsRef.current) return;

    const rows = fieldsRef.current.querySelectorAll('.field-row, .field-display');
    if (!rows.length) return;

    gsap.fromTo(
      rows,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, stagger: 0.05, duration: 0.35, ease: 'power2.out' }
    );
  }, { scope: fieldsRef, dependencies: [showReadOnly, autoFilled] });

  return (
    <div className="space-y-5">
      {autoFilled && (
        <div className="flex flex-col gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-green-600" />
            <span className="text-sm font-medium text-green-700">Details extracted from PDF</span>
          </div>

          <button
            type="button"
            onClick={onToggleEdit}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700 transition hover:text-green-800"
          >
            <Pencil size={14} />
            {showReadOnly ? 'Edit details' : 'Lock fields'}
          </button>
        </div>
      )}

      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Project Information</h2>
          <p className="mt-2 text-sm text-slate-500">Review the extracted fields and edit anything before continuing.</p>
        </div>

        <div ref={fieldsRef}>
          <AnimatePresence mode="wait">
            {showReadOnly ? (
              <motion.div
                key="readonly"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 gap-4 sm:grid-cols-2"
              >
                <ReadonlyField label="Project Name" value={projectInfo.project_name} className="sm:col-span-2" />
                <ReadonlyField label="Client Name" value={projectInfo.client_name} />
                <ReadonlyField label="Project Type" value={projectInfo.project_type} />
                <ReadonlyField label="Location" value={projectInfo.location} />
                <ReadonlyField label="Estimated Value" value={projectInfo.estimated_value ? `${projectInfo.estimated_value} ${projectInfo.currency}` : ''} />
                <ReadonlyField label="Deadline" value={projectInfo.deadline} />
                <ReadonlyField label="Tender Number" value={projectInfo.tender_number} />
                <ReadonlyField label="Description" value={projectInfo.description} className="sm:col-span-2" multiline />
                <ReadonlyField label="Contact Person" value={projectInfo.contact_person} />
                <ReadonlyField label="Contact Email" value={projectInfo.contact_email} />
              </motion.div>
            ) : (
              <motion.div
                key="editable"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="space-y-4"
              >
                <FormField label="Project Name" required error={errors.project_name}>
                  <input
                    value={projectInfo.project_name}
                    onChange={(event) => onUpdate('project_name', event.target.value)}
                    className={`input-field ${errors.project_name ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
                    placeholder="North Block Phase 2"
                  />
                </FormField>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Client Name" required error={errors.client_name}>
                    <input
                      value={projectInfo.client_name}
                      onChange={(event) => onUpdate('client_name', event.target.value)}
                      className={`input-field ${errors.client_name ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
                      placeholder="ABC Construction Pvt Ltd"
                    />
                  </FormField>

                  <FormField label="Project Type" required error={errors.project_type}>
                    <select
                      value={projectInfo.project_type}
                      onChange={(event) => onUpdate('project_type', event.target.value)}
                      className={`input-field ${errors.project_type ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
                    >
                      <option value="">Select type</option>
                      {PROJECT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Location" required error={errors.location}>
                    <input
                      value={projectInfo.location}
                      onChange={(event) => onUpdate('location', event.target.value)}
                      className={`input-field ${errors.location ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
                      placeholder="Mumbai, Maharashtra"
                    />
                  </FormField>

                  <FormField label="Tender Number">
                    <input
                      value={projectInfo.tender_number}
                      onChange={(event) => onUpdate('tender_number', event.target.value)}
                      className="input-field"
                      placeholder="NIT/2026/ELEC/001"
                    />
                  </FormField>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-[2fr,1fr,1fr]">
                  <FormField label="Estimated Value">
                    <input
                      type="number"
                      value={projectInfo.estimated_value}
                      onChange={(event) => onUpdate('estimated_value', event.target.value)}
                      className="input-field"
                      placeholder="184"
                    />
                  </FormField>

                  <FormField label="Currency">
                    <select
                      value={projectInfo.currency}
                      onChange={(event) => onUpdate('currency', event.target.value)}
                      className="input-field"
                    >
                      {CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </FormField>

                  <FormField label="Deadline">
                    <input
                      type="date"
                      value={projectInfo.deadline}
                      onChange={(event) => onUpdate('deadline', event.target.value)}
                      className="input-field"
                    />
                  </FormField>
                </div>

                <FormField label="Description" required error={errors.description}>
                  <textarea
                    rows={4}
                    value={projectInfo.description}
                    onChange={(event) => onUpdate('description', event.target.value)}
                    className={`input-field resize-none ${errors.description ? 'border-red-400 focus:border-red-500 focus:ring-red-100' : ''}`}
                    placeholder="Brief project summary..."
                  />
                </FormField>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField label="Contact Person">
                    <input
                      value={projectInfo.contact_person}
                      onChange={(event) => onUpdate('contact_person', event.target.value)}
                      className="input-field"
                      placeholder="Rajesh Sharma"
                    />
                  </FormField>

                  <FormField label="Contact Email">
                    <input
                      type="email"
                      value={projectInfo.contact_email}
                      onChange={(event) => onUpdate('contact_email', event.target.value)}
                      className="input-field"
                      placeholder="rajesh@company.com"
                    />
                  </FormField>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function DocumentsStep({
  documents,
  documentError,
  onSetDoc,
  onAddMulti,
  onRemoveSingle,
  onRemoveMulti,
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Upload Project Files</h2>
        <p className="mt-2 text-sm text-slate-500">Upload only BOQ Excel, CAD drawings, and technical/tender documents.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {DOC_ZONES.map((zone) => (
          <DocZone
            key={zone.key}
            zone={zone}
            fileItems={zone.multi ? documents[zone.key] : documents[zone.key] ? [documents[zone.key]] : []}
            onAddFiles={(files) => {
              if (zone.multi) {
                onAddMulti(zone.key, files);
              } else {
                onSetDoc(zone.key, files[0] || null);
              }
            }}
            onRemoveFile={(index) => {
              if (zone.multi) {
                onRemoveMulti(zone.key, index);
              } else {
                onRemoveSingle(zone.key);
              }
            }}
          />
        ))}
      </div>

      {documentError && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {documentError}
        </div>
      )}

      <div className="flex items-start gap-3 rounded-2xl border-l-[3px] border-teal-600 bg-sky-50 px-5 py-4">
        <Upload size={16} className="mt-0.5 shrink-0 text-teal-600" />
        <p className="text-sm text-slate-600">
          Upload BOQ + CAD drawings together for AI cross-referencing and automatic specification matching.
        </p>
      </div>
    </div>
  );
}

function CompletedStep({ project, saveMode, onOpenProject, onAddVendors }) {
  return (
    <div className="space-y-6 py-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50">
          <CheckCircle2 size={32} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900">Project created</h2>
        <p className="mt-2 text-sm text-slate-500">
          {saveMode === 'create_extract'
            ? 'The project is saved and BOQ extraction will start when you open the project page.'
            : 'The project is saved. You can open it now or add vendors first.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-[24px] border border-slate-200 bg-slate-50 p-5 sm:grid-cols-2">
        <ReadonlyField label="Project Name" value={project.project_name} className="bg-white" />
        <ReadonlyField label="Client Name" value={project.client_name} className="bg-white" />
        <ReadonlyField label="Project Type" value={project.project_type} className="bg-white" />
        <ReadonlyField label="Location" value={project.location} className="bg-white" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
        <button type="button" onClick={onOpenProject} className="btn-secondary text-sm">
          Go to Project
        </button>
        <button type="button" onClick={onAddVendors} className="btn-primary text-sm">
          Add Vendors
        </button>
      </div>
    </div>
  );
}

function DocZone({ zone, fileItems, onAddFiles, onRemoveFile }) {
  const inputId = useId();
  const zoneRef = useRef(null);
  const chipRefs = useRef(new Map());
  const [dragging, setDragging] = useState(false);
  const { icon: Icon } = zone;

  useEffect(() => {
    if (!zoneRef.current) return;

    gsap.to(zoneRef.current, {
      scale: dragging ? 1.02 : 1,
      duration: 0.2,
      ease: 'power2.out',
    });
  }, [dragging]);

  useGSAP(() => {
    if (!fileItems.length) return;

    const chips = Array.from(chipRefs.current.values()).filter(Boolean);
    if (!chips.length) return;

    gsap.fromTo(
      chips,
      { x: 20, opacity: 0, scale: 0.92 },
      { x: 0, opacity: 1, scale: 1, duration: 0.25, stagger: 0.05, ease: 'back.out(1.4)' }
    );
  }, { scope: zoneRef, dependencies: [fileItems.length] });

  const acceptFiles = (incomingFiles) => {
    const files = Array.from(incomingFiles || []);
    if (!files.length) return;

    const validFiles = files.filter((file) => matchesAcceptedFile(file, zone.accept));
    if (!validFiles.length) {
      toast.error(`${zone.label} accepts ${zone.hint}.`);
      return;
    }

    if (validFiles.length !== files.length) {
      toast.error(`Some files were skipped. ${zone.label} accepts ${zone.hint}.`);
    }

    onAddFiles(zone.multi ? validFiles : [validFiles[0]]);
  };

  const handleRemove = (fileKey, index) => {
    const chip = chipRefs.current.get(fileKey);
    if (!chip) {
      onRemoveFile(index);
      return;
    }

    gsap.to(chip, {
      opacity: 0,
      x: 12,
      height: 0,
      paddingTop: 0,
      paddingBottom: 0,
      marginTop: 0,
      marginBottom: 0,
      duration: 0.2,
      ease: 'power2.in',
      onComplete: () => onRemoveFile(index),
    });
  };

  return (
    <div className="space-y-3">
      <input
        id={inputId}
        type="file"
        accept={zone.accept === '*' ? undefined : zone.accept}
        multiple={zone.multi}
        className="sr-only"
        onChange={(event) => {
          acceptFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <label
        ref={zoneRef}
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          acceptFiles(event.dataTransfer.files);
        }}
        className="block cursor-pointer rounded-[20px] border-2 border-dashed p-5 transition-colors"
        style={{
          background: fileItems.length ? `${zone.background}CC` : zone.background,
          borderColor: dragging || fileItems.length ? zone.border : '#E5E7EB',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white/80 p-3 shadow-sm">
              <Icon size={20} className={zone.iconClass} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-slate-800">{zone.label}</p>
                {zone.requiredForExtract && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
                    Required for extract
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500">{zone.hint}</p>
            </div>
          </div>

          {fileItems.length > 0 && <CheckCircle2 size={18} className="shrink-0 text-green-600" />}
        </div>

        <div className="mt-5 rounded-2xl border border-white/70 bg-white/60 px-4 py-3 text-center text-xs font-medium text-slate-500">
          {fileItems.length > 0
            ? `${fileItems.length} file${fileItems.length === 1 ? '' : 's'} loaded`
            : 'Drop files or click to upload'}
        </div>
      </label>

      {fileItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {fileItems.map((file, index) => {
            const fileKey = getFileKey(file, index);

            return (
              <div
                key={fileKey}
                ref={(node) => {
                  if (node) {
                    chipRefs.current.set(fileKey, node);
                  } else {
                    chipRefs.current.delete(fileKey);
                  }
                }}
                className="file-chip flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm"
              >
                <div>
                  <p className="max-w-[180px] truncate font-medium text-slate-700">{file.name}</p>
                  <p className="text-[11px] text-slate-400">{formatFileSize(file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(fileKey, index)}
                  className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-red-500"
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FormField({ label, required, error, children }) {
  return (
    <div className="field-row flex flex-col gap-1.5">
      <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function ReadonlyField({ label, value, className = '', multiline = false }) {
  return (
    <div className={`field-display rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-2 text-sm font-medium text-slate-800 ${multiline ? 'whitespace-pre-wrap' : ''}`}>
        {formatValue(value)}
      </p>
    </div>
  );
}
