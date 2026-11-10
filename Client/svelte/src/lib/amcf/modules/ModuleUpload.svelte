<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import Upload from '@lucide/svelte/icons/upload';
	import Clock from '@lucide/svelte/icons/clock';
	import FileUp from '@lucide/svelte/icons/file-up';
	import X from '@lucide/svelte/icons/x';
	import { onDestroy } from 'svelte';

	import { useModuleTick } from '$lib/amcf/poll.svelte';

	let { module, app }: { module: any; app: any } = $props();
	const poll = useModuleTick(() => module);

	const MESSAGE_DURATION_MS = 5000;
	// After a file upload the operation that takes the file over reports through the busy attribute. Until
	// then the zone shows that it is starting; without a report it returns to the prompt after this time.
	const STARTING_TIMEOUT_MS = 10000;

	let visible = $derived.by(() => { poll.v; return module.visible !== false; });
	let dragOver = $state(false);
	let uploading = $state(false);
	let statusMessage = $state('');
	let uploadProgress = $state(0);

	// The upload class "file" accepts any file unless the item restricts the types.
	let isFileClass = $derived(module.uploadclass === 'file');
	let acceptedTypes = $derived(module.acceptedtypes || (module.uploadclass === 'image' ? '.png,.jpg' : (module.uploadclass === 'file' ? '' : '.3mf')));
	// The caption can be bound to a parameter (sync:caption), so it is read on every update of the module.
	let caption = $derived.by(() => {
		poll.v;
		return module.uploadcaption || (module.uploadclass === 'file' ? 'Select files to upload' : `Select ${module.uploadclass === 'image' ? 'image' : '3MF'} files to upload`);
	});

	// Busy mode (attributes busy and busyevent): the zone is the button of a running server operation. It
	// shows the caption, which the operation sets, opens no file dialog and sends the busy event on a click.
	let busy = $derived.by(() => { poll.v; return module.busy === true; });

	// Upload class "file": the local phase of this session (idle, uploading, verifying, starting, message),
	// kept in the upload state of the module by the application core. What the zone shows, first match wins:
	//   1 uploading   "Uploading <file>: N% · Click to cancel"   a click cancels the own upload
	//   2 verifying   "Verifying upload…"                        clicks are ignored
	//   3 starting    "Starting…"                                clicks are ignored
	//   4 busy        the caption of the operation, clock icon   a click sends the busy event
	//   5 message     a short message for a few seconds          a click opens the file dialog
	//   6 otherwise   the caption                                a click opens the file dialog
	// So a click always refers to what the caption says. Files dropped in the cases 1 to 4 are rejected.
	let localPhase = $state('idle');
	let localMessage = $state('');
	let fileName = $state('');
	let phaseTimer: ReturnType<typeof setTimeout> | null = null;

	function clearPhaseTimer () {
		if (phaseTimer !== null) {
			clearTimeout(phaseTimer);
			phaseTimer = null;
		}
	}

	function onPhase (phase: string, message: string) {
		clearPhaseTimer();
		localPhase = phase;
		localMessage = message || '';

		// Messages and the wait for the operation end on their own.
		if (phase === 'message' || phase === 'starting') {
			const expectedPhase = phase;
			phaseTimer = setTimeout(() => {
				phaseTimer = null;
				if (module.state.phase === expectedPhase)
					module.state.setPhase('idle', '');
			}, phase === 'message' ? MESSAGE_DURATION_MS : STARTING_TIMEOUT_MS);
		}
	}

	$effect(() => {
		if (!isFileClass)
			return;

		// The operation has reported: the zone is its button now.
		if (busy && localPhase === 'starting')
			module.state.setPhase('idle', '');

		// Another session has started the operation while this one is still sending its file: the upload
		// would be rejected at its end, so it is cancelled now and the user is told why.
		if (busy && localPhase === 'uploading')
			app.cancelFileUpload(module.state, 'Upload cancelled: another operation has started.', module.uploadsuccessevent, !!module.busyevent);
	});

	// The upload belongs to the module, not to this component: when the page is shown again while a file
	// upload of this session is under way, the zone continues with its phase and progress.
	if (module.uploadclass === 'file' && module.state && typeof module.state.setPhase === 'function') {
		fileName = module.state.chosenFile?.name || '';
		uploadProgress = module.state.progress || 0;
		module.state._onProgress = (percent: number) => {
			uploadProgress = percent;
		};
		module.state._onPhase = onPhase;
		onPhase(module.state.phase || 'idle', module.state.phaseMessage || '');
	}

	onDestroy(clearPhaseTimer);

	let zoneIsLocked = $derived(isFileClass && (localPhase === 'uploading' || localPhase === 'verifying' || localPhase === 'starting' || busy));

	function handleFiles (files: FileList | null) {
		if (!files || files.length === 0 || !app) return;
		const file = files[0];

		if (typeof module.state.setChosenFile === 'function')
			module.state.setChosenFile(file);
		else
			module.state.chosenFile = file;

		if (isFileClass) {
			fileName = file.name;
			uploadProgress = 0;
			module.state._onProgress = (percent: number) => {
				uploadProgress = percent;
			};
			module.state._onComplete = null;
			module.state._onError = null;
			module.state._onPhase = onPhase;

			try {
				app.performFileUpload(module.state, module.uploadsuccessevent, module.uploadfailureevent, { operationFollows: !!module.busyevent });
			} catch (e) {
				console.error('File upload could not be started', e);
				module.state.setPhase('message', 'Upload failed.');
			}
			return;
		}

		uploading = true;
		uploadProgress = 0;
		statusMessage = `Uploading ${file.name}...`;

		module.state._onProgress = (percent: number) => {
			uploadProgress = percent;
		};
		module.state._onComplete = () => {
			uploadProgress = 100;
			statusMessage = `${file.name} uploaded successfully.`;
			uploading = false;
		};
		module.state._onError = () => {
			statusMessage = `Upload failed.`;
			uploading = false;
		};

		try {
			if (module.uploadclass === 'image')
				app.performImageUpload(module.state, module.uploadsuccessevent, module.uploadfailureevent);
			else
				app.performJobUpload(module.state, module.uploadsuccessevent, module.uploadfailureevent);
		} catch (e) {
			statusMessage = `Upload failed.`;
			uploading = false;
		}
	}

	function openFileDialog () {
		document.getElementById(`upload-${module.uuid}`)?.click();
	}

	function onZoneClick () {
		if (isFileClass) {
			if (localPhase === 'uploading') {
				app.cancelFileUpload(module.state, 'Upload cancelled.', module.uploadsuccessevent, !!module.busyevent);
				return;
			}
			if (localPhase === 'verifying' || localPhase === 'starting')
				return;
			if (busy) {
				if (module.busyevent)
					app.triggerUIEvent(module.busyevent, module.uuid, {});
				return;
			}
		}

		openFileDialog();
	}

	function onDrop (e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		if (zoneIsLocked)
			return;
		handleFiles(e.dataTransfer?.files ?? null);
	}

	function onDragOver (e: DragEvent) {
		e.preventDefault();
		// A locked zone takes no file and does not light up.
		dragOver = !zoneIsLocked;
	}

	function onDragLeave () {
		dragOver = false;
	}

	function onFileInput (e: Event) {
		const target = e.target as HTMLInputElement;
		if (!zoneIsLocked)
			handleFiles(target.files);
		target.value = '';
	}
</script>

{#if visible}
	<div class="w-full">
		<div
			role="button"
			tabindex="0"
			data-upload-phase={isFileClass ? (zoneIsLocked && localPhase === 'idle' ? 'busy' : localPhase) : (uploading ? 'uploading' : 'idle')}
			class="relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
				{dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}"
			ondrop={onDrop}
			ondragover={onDragOver}
			ondragleave={onDragLeave}
			onclick={onZoneClick}
			onkeydown={(e) => e.key === 'Enter' && onZoneClick()}
		>
			<input
				id={`upload-${module.uuid}`}
				type="file"
				accept={acceptedTypes}
				class="hidden"
				onclick={(e) => e.stopPropagation()}
				onchange={onFileInput}
			/>

			{#if isFileClass && localPhase === 'uploading'}
				<div class="flex flex-col items-center gap-3">
					<div class="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
					<p class="text-sm text-muted-foreground" data-upload-caption>Uploading {fileName}: {Math.round(uploadProgress)}% · Click to cancel</p>
					<div class="w-full max-w-xs">
						<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
							<div
								class="h-full rounded-full bg-primary transition-all duration-150"
								style={`width: ${Math.max(0, Math.min(100, uploadProgress))}%`}
							></div>
						</div>
					</div>
				</div>
			{:else if isFileClass && (localPhase === 'verifying' || localPhase === 'starting')}
				<div class="flex flex-col items-center gap-3">
					<div class="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
					<p class="text-sm text-muted-foreground" data-upload-caption>{localPhase === 'verifying' ? 'Verifying upload…' : 'Starting…'}</p>
				</div>
			{:else if isFileClass && busy}
				<div class="flex flex-col items-center gap-2">
					<Clock class="h-8 w-8 text-muted-foreground" />
					<p class="text-sm text-muted-foreground" data-upload-caption>{caption}</p>
					{#if localPhase === 'message' && localMessage}
						<!-- The end of the own upload is still told while the zone is the button of the operation. -->
						<p class="text-xs text-muted-foreground" data-upload-message>{localMessage}</p>
					{/if}
				</div>
			{:else if isFileClass && localPhase === 'message'}
				<div class="flex flex-col items-center gap-2">
					<Upload class="h-8 w-8 text-muted-foreground" />
					<p class="text-sm text-muted-foreground" data-upload-caption>{localMessage}</p>
				</div>
			{:else if uploading}
				<div class="flex flex-col items-center gap-3">
					<div class="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full"></div>
					<p class="text-sm text-muted-foreground">{statusMessage}</p>
					<div class="w-full max-w-xs">
						<div class="h-2 w-full overflow-hidden rounded-full bg-muted">
							<div
								class="h-full rounded-full bg-primary transition-all duration-150"
								style={`width: ${Math.max(0, Math.min(100, uploadProgress))}%`}
							></div>
						</div>
						<p class="mt-1 text-center text-xs text-muted-foreground">
							{Math.round(uploadProgress)}%
						</p>
					</div>
				</div>
			{:else}
				<div class="flex flex-col items-center gap-2">
					<Upload class="h-8 w-8 text-muted-foreground" />
					<p class="text-sm text-muted-foreground" data-upload-caption>{caption}</p>
					{#if statusMessage}
						<p class="text-xs text-green-600">{statusMessage}</p>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}
