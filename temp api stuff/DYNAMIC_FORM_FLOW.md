# Dynamic Form – End-to-End Flow

This document describes the **entire flow** of the database-driven Complaint Registration form: file names, function names, and data flow from route to database and back.

---

## 1. High-Level Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ USER opens route: /complaint-registration-form                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND (Angular)                                                                │
│   ComplaintRegistrationForm.ngOnInit()                                            │
│        → loadFormConfiguration()                                                  │
│             → FormConfigService.buildFormSchema('complaint_registration')         │
│                  → HTTP GET /api/form-config/complaint_registration/schema        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ BACKEND (NestJS) – Form Config                                                    │
│   FormConfigController.getFormSchema(formName)                                    │
│        → FormConfigService.buildFormSchema(formName)                               │
│             → formConfigDbHandler.getFormConfig(formName)     → form_configs      │
│             → formConfigDbHandler.getFormFields(formConfig._id) → form_fields     │
│             → formConfigDbHandler.getAllMasterData(types)     → form_master_data  │
│        ← returns { formConfig, fields, masterData }                               │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND – Build form                                                             │
│   loadFormConfiguration() next: (schema)                                          │
│        → formSchema.set(schema), formConfig.set(...), formFields.set(...)         │
│        → DynamicFormBuilderService.buildFormGroup(schema.fields)                   │
│             → buildValidators(field.validation_rules) per field                   │
│             → _getDefaultValueForFieldType(field.field_type) per field             │
│             → FormBuilder.group({ field_name: [default, validators], ... })       │
│        → DynamicFormBuilderService.setupConditionalValidation(fields, form)       │
│             → _checkDependencyCondition() for required/optional dependencies      │
│        → _loadFieldOptions(schema.fields)                                         │
│             → DynamicFormBuilderService.resolveOptions(field) for select/radio   │
│                  → static | getMasterData(data_type) | HTTP api_endpoint         │
│             → fieldOptionsCache.update(...)                                       │
│        → isLoading.set(false)                                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND – Render (Template)                                                      │
│   complaint-registration-form.html                                                │
│   • steps() → formConfig()?.steps                                                 │
│   • getSectionNamesForStep(step.step) → Object.keys(fieldsByStep()[step])        │
│   • getFieldsForSection(step, section) → fieldsByStep()[step][section]            │
│   • fieldsByStep → DynamicFormBuilderService.groupFieldsByStepAndSection(fields) │
│   • *ngFor field: isFieldVisible(field) → _formBuilder.isFieldVisible(field, form)│
│   • getFieldOptions(field.field_name) → fieldOptionsCache()[fieldName]            │
│   • hasFieldError(fieldName), getFieldError(fieldName) for validation UI          │
│   • (Next) onNextStep() → isCurrentStepValid() then currentStep.set(next)         │
│   • (Back) onBackStep() → currentStep.set(prev)                                  │
│   • (Submit) onSubmit() → ComplaintService.createComplaint(formData, FORM_NAME) │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND – Submit                                                                 │
│   ComplaintService.createComplaint(payload, formName)                             │
│        → HTTP POST /api/complaints/submit                                         │
│             body: { form_name: 'complaint_registration', payload: getRawValue() } │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ BACKEND (NestJS) – Complaint                                                      │
│   ComplaintController.submit(@Body() body: SubmitComplaintDto)                     │
│        → ComplaintService.createComplaint(body.payload, body.form_name)           │
│        ← returns { id: 'complaint-<timestamp>' }  (stub; no DB yet)              │
└─────────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND – After submit                                                           │
│   next: MsgService.success(...), Router.navigate(['/'])                           │
│   error: MsgService.errorApi(...), isSubmitting.set(false)                        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Entry Point & Routing

| What | File | Detail |
|------|------|--------|
| Route | `retms_web/src/app/pages/pages.routes.ts` | `path: 'complaint-registration-form'` → `ComplaintRegistrationForm` |
| Component | `retms_web/src/app/pages/complaint-registration-form/complaint-registration-form.ts` | `selector: 'app-complaint-registration-form'` |
| Template | `retms_web/src/app/pages/complaint-registration-form/complaint-registration-form.html` | Renders header, stepper, sections, fields, actions |
| Styles | `retms_web/src/app/pages/complaint-registration-form/complaint-registration-form.scss` | Layout (e.g. form-grid 3/2/1 columns), fields, actions |

**Lifecycle:** When the route is loaded, Angular creates the component and runs `ngOnInit()` → `loadFormConfiguration()`.

---

## 3. Schema Load Flow (Frontend → API → DB)

### 3.1 Frontend – Request schema

| Step | File | Function | Description |
|------|------|----------|-------------|
| 1 | `complaint-registration-form.ts` | `ngOnInit()` | Entry; calls `loadFormConfiguration()`. |
| 2 | `complaint-registration-form.ts` | `loadFormConfiguration()` | Sets `isLoading.set(true)`, calls `_formConfigService.buildFormSchema(this.FORM_NAME)`. |
| 3 | `retms_web/src/app/services/form-config.service.ts` | `buildFormSchema(formName: string)` | `GET ${apiUrl}form-config/${formName}/schema` (withCredentials). Returns `Observable<IFormSchema>`. |

**Constant:** `FORM_NAME = 'complaint_registration'` in `complaint-registration-form.ts`.

### 3.2 Backend – Build and return schema

| Step | File | Function | Description |
|------|------|----------|-------------|
| 1 | `retms_api/src/modules/form-config/controllers/form-config.controller.ts` | `getFormSchema(@Param('formName') formName: string)` | Handles `GET :formName/schema`. Calls `formConfigService.buildFormSchema(formName)`. Returns `ApiResponse(200, schema)`. |
| 2 | `retms_api/src/modules/form-config/services/form-config.service.ts` | `buildFormSchema(formName: string)` | Gets config, then fields, then all master data types from fields; returns `{ formConfig, fields, masterData }`. |
| 3 | Same file | `getFormConfig(formName)` | Calls `formConfigDbHandler.getFormConfig(formName)`. |
| 4 | Same file | `getFormFields(formConfig._id)` | Calls `formConfigDbHandler.getFormFields(formConfig._id)`. |
| 5 | Same file | `formConfigDbHandler.getAllMasterData(Array.from(masterDataTypes))` | Single batch fetch for all `data_type`s needed by fields. |

### 3.3 Backend – Database layer (form config)

| Step | File | Function | Description |
|------|------|----------|-------------|
| 1 | `retms_api/src/modules/form-config/services/form-config.db.handler.ts` | `getFormConfig(formName: string)` | **FormConfigMySqlPgDbHandlers:** queries `form_configs` by `form_name`, `is_active`; returns one row as `IFormConfig`. |
| 2 | Same file | `getFormFields(formConfigId: string)` | Queries `form_fields` by `form_config_id`, ordered by `step_number`; parses JSONB `validation_rules`, `options_data`, `dependencies`; returns `IFormField[]`. |
| 3 | Same file | `getAllMasterData(dataTypes: string[])` | Queries `form_master_data` where `data_type IN (...)` and `is_active`; returns `Record<string, IFormMasterData[]>`. |

**Tables:** `form_configs`, `form_fields`, `form_master_data` (see `database_migrations/001_create_form_tables.sql`).

---

## 4. Form Build Flow (Frontend)

After `loadFormConfiguration()` receives the schema in the `next` callback:

| Step | File | Function | Description |
|------|------|----------|-------------|
| 1 | `complaint-registration-form.ts` | `loadFormConfiguration()` next callback | Sets `formSchema`, `formConfig`, `formFields`, `masterDataCache`. |
| 2 | `retms_web/src/app/utils/dynamic-form-builder.service.ts` | `buildFormGroup(fields: IFormField[])` | For each field: `buildValidators(field.validation_rules)`, `_getDefaultValueForFieldType(field.field_type)`, then `_fb.group({ [field_name]: [default, validators], ... })`. |
| 3 | Same file | `buildValidators(rules?: IValidationRules)` | Maps `required`, `maxLength`, `minLength`, `pattern`, `email`, `min`, `max` to Angular `Validators.*`. |
| 4 | Same file | `_getDefaultValueForFieldType(fieldType)` | Returns `''`, `null`, or `false` by type (e.g. checkbox → false). |
| 5 | `complaint-registration-form.ts` | (same callback) | `dynamicForm = _formBuilder.buildFormGroup(schema.fields)`. |
| 6 | `dynamic-form-builder.service.ts` | `setupConditionalValidation(fields, formGroup)` | For each field with `dependencies.action` in `['required','optional']`: subscribes to `dependsOn` control, calls `_checkDependencyCondition()`, updates target validators and `updateValueAndValidity`. |
| 7 | Same file | `_checkDependencyCondition(dependsOnValue, condition, expectedValue)` | Evaluates `equals` / `not_equals` / `contains` / `greater_than` / `less_than`. |
| 8 | `complaint-registration-form.ts` | `_loadFieldOptions(schema.fields)` | For each field with `field_type === 'select' | 'radio'` and `options_source`/`options_data`: calls `_formBuilder.resolveOptions(field)`, then updates `fieldOptionsCache`. |
| 9 | `dynamic-form-builder.service.ts` | `resolveOptions(field: IFormField)` | **static:** return `options_data.static`; **master_data:** `_formConfigService.getMasterData(options_data.data_type)` and map to `{ label, value, disabled }`; **api:** HTTP GET/POST to `options_data.api_endpoint`. |

---

## 5. Render Flow (Template & Component)

The template uses component methods and computed signals to show steps, sections, and fields.

### 5.1 Steps and sections

| Usage | File | Function / Source | Description |
|-------|------|-------------------|-------------|
| Step list | `complaint-registration-form.html` | `steps()` | Computed: `formConfig()?.steps || []`. |
| Section names per step | `complaint-registration-form.html` | `getSectionNamesForStep(step.step)` | `complaint-registration-form.ts`: `Object.keys(fieldsByStep()[stepNumber] || {})`. |
| Fields per section | `complaint-registration-form.html` | `getFieldsForSection(step.step, sectionName)` | Returns `fieldsByStep()[stepNumber]?.[sectionName] || []`. |
| Grouped fields | `complaint-registration-form.ts` | `fieldsByStep` (computed) | `_formBuilder.groupFieldsByStepAndSection(this.formFields())`. |
| Grouping logic | `dynamic-form-builder.service.ts` | `groupFieldsByStepAndSection(fields)` | Builds `Record<stepNumber, Record<sectionName, IFormField[]>>`, sorts each section by `display_order`. |

### 5.2 Field visibility and options

| Usage | File | Function | Description |
|-------|------|----------|-------------|
| Show/hide field | `complaint-registration-form.html` | `isFieldVisible(field)` | Component: `_formBuilder.isFieldVisible(field, this.dynamicForm)`. |
| Visibility logic | `dynamic-form-builder.service.ts` | `isFieldVisible(field, formGroup)` | If no `dependencies.depends_on`, returns `field.is_visible !== false`. Else reads dependent control value, evaluates `condition` (equals/not_equals/contains/greater_than/less_than), applies `action` (show/hide). |
| Dropdown/radio options | `complaint-registration-form.html` | `getFieldOptions(field.field_name)` | Component: `fieldOptionsCache()[fieldName] || []`. |

### 5.3 Validation UI

| Usage | File | Function | Description |
|-------|------|----------|-------------|
| Error state | `complaint-registration-form.html` | `hasFieldError(field.field_name)` | Component: control exists, `invalid`, and `touched`. |
| Error text | `complaint-registration-form.html` | `getFieldError(field.field_name)` | Component: maps `control.errors` (required, maxlength, minlength, pattern, email, min, max) to message string. |

---

## 6. Step Navigation

| Action | File | Function | Description |
|--------|------|----------|-------------|
| Next | `complaint-registration-form.html` | `onNextStep(activateCallback)` | Component: if `!isCurrentStepValid()` → mark step fields touched, show error, return. Else `currentStep.set(nextStep)`, `activateCallback(nextStep)`. |
| Valid step | `complaint-registration-form.ts` | `isCurrentStepValid()` | Filters `formFields()` by `step_number === currentStep` and `is_required`; returns whether every such field’s control is valid. |
| Back | `complaint-registration-form.html` | `onBackStep(activateCallback)` | Component: `currentStep.set(prevStep)`, `activateCallback(prevStep)`. |

---

## 7. Submit Flow (Frontend → API)

| Step | File | Function | Description |
|------|------|----------|-------------|
| 1 | `complaint-registration-form.html` | (Submit button) | Calls `onSubmit()`. |
| 2 | `complaint-registration-form.ts` | `onSubmit()` | If form invalid: mark all touched/dirty, show validation error, return. Else `isSubmitting.set(true)`, `formData = dynamicForm.getRawValue()`, `_complaintService.createComplaint(formData, this.FORM_NAME).subscribe(...)`. |
| 3 | `retms_web/src/app/services/complaint.service.ts` | `createComplaint(payload, formName)` | POST `${apiUrl}complaints/submit` with body `{ form_name: formName, payload }`, `withCredentials: true`. |
| 4 | `retms_api/src/modules/complaint/controllers/complaint.controller.ts` | `submit(@Body() body: SubmitComplaintDto)` | Handles `POST submit`. Extracts `body.form_name`, `body.payload`; calls `complaintService.createComplaint(payload, formName)`. Returns `ApiResponse(201, response, ...)`. |
| 5 | `retms_api/src/modules/complaint/services/complaint.service.ts` | `createComplaint(payload, formName?)` | Stub: returns `{ id: 'complaint-' + Date.now() }`. (No DB persistence yet.) |
| 6 | `complaint-registration-form.ts` | `onSubmit()` subscribe next | `isSubmitting.set(false)`, `MsgService.success('Complaint registered successfully')`, `_router.navigate(['/'])`. |
| 7 | Same | subscribe error | `isSubmitting.set(false)`, `MsgService.errorApi(message)`. |

**DTO:** `retms_api/src/modules/complaint/dto/submit-complaint.dto.ts` – `form_name?: string`, `payload: Record<string, unknown>`.

---

## 8. Other Form Actions

| Action | File | Function | Description |
|--------|------|----------|-------------|
| Preview | `complaint-registration-form.ts` | `onPreview()` | If invalid: mark touched, show error. Else `getRawValue()`, log, toast “Form data ready for preview”. |
| Reset | `complaint-registration-form.ts` | `onReset()` | `dynamicForm.reset()`, restore defaults from `formFields()`, `currentStep.set(1)`, toast. |
| Cancel | `complaint-registration-form.ts` | `onCancel()` | `_router.navigate(['/'])`. |

---

## 9. File Reference (Quick Index)

### Frontend (retms_web)

| File | Purpose |
|------|--------|
| `src/app/pages/pages.routes.ts` | Route `complaint-registration-form` → component. |
| `src/app/pages/complaint-registration-form/complaint-registration-form.ts` | Component: load schema, build form, steps, validation, submit. |
| `src/app/pages/complaint-registration-form/complaint-registration-form.html` | Template: stepper, sections, fields by type, errors, actions. |
| `src/app/pages/complaint-registration-form/complaint-registration-form.scss` | Styles: form-grid, responsive, fields, actions. |
| `src/app/services/form-config.service.ts` | `getFormConfig`, `getFormFields`, `getMasterData`, `buildFormSchema` (HTTP). |
| `src/app/services/complaint.service.ts` | `createComplaint(payload, formName)` (POST submit). |
| `src/app/utils/dynamic-form-builder.service.ts` | `buildFormGroup`, `buildValidators`, `setupConditionalValidation`, `groupFieldsByStepAndSection`, `resolveOptions`, `isFieldVisible`, `_getDefaultValueForFieldType`, `_checkDependencyCondition`. |
| `src/interfaces/form-config.interface.ts` | `IFormConfig`, `IFormField`, `IFormSchema`, `IValidationRules`, `IDependencies`, etc. |

### Backend (retms_api)

| File | Purpose |
|------|--------|
| `src/modules/form-config/controllers/form-config.controller.ts` | `getFormConfig`, `getFormFields`, `getFormSchema`, `getMasterData`. |
| `src/modules/form-config/services/form-config.service.ts` | `getFormConfig`, `getFormFields`, `getMasterData`, `buildFormSchema`. |
| `src/modules/form-config/services/form-config.db.handler.ts` | `FormConfigDBHandler`, `FormConfigMySqlPgDbHandlers`: `getFormConfig`, `getFormFields`, `getMasterData`, `getAllMasterData`. |
| `src/modules/complaint/controllers/complaint.controller.ts` | `submit(@Body() SubmitComplaintDto)`. |
| `src/modules/complaint/services/complaint.service.ts` | `createComplaint(payload, formName?)`. |
| `src/modules/complaint/dto/submit-complaint.dto.ts` | `form_name?`, `payload`. |
| `src/interface/form-config.interface.ts` | `IFormConfig`, `IFormField`, `IFormMasterData`, `IFormResponse`, etc. |

### Database

| File | Purpose |
|------|--------|
| `database_migrations/001_create_form_tables.sql` | Creates `form_configs`, `form_fields`, `form_master_data`. |
| `database_migrations/002_seed_complaint_registration_form_v2.sql` | Seeds complaint registration form and master data. |

---

## 10. Data Shapes (Key Types)

- **IFormSchema:** `{ formConfig: IFormConfig, fields: IFormField[], masterData?: Record<string, IFormMasterData[]> }`.
- **IFormConfig:** `_id`, `form_name`, `form_title`, `form_description`, `steps: { step, title }[]`, `is_active`.
- **IFormField:** `field_name`, `field_label`, `field_type`, `step_number`, `section_name`, `validation_rules`, `options_source`, `options_data`, `dependencies`, `display_order`, etc.
- **Submit body:** `{ form_name?: string, payload: Record<string, unknown> }`.
- **Submit response:** `{ id: string }`.

This flow document, together with the file and function names above, should make it easy to follow the dynamic form from route to database and back.
