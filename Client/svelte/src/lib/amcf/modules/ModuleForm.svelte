<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Switch } from '$lib/components/ui/switch/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import { NumericStepper } from '$lib/components/ui/numeric-stepper/index.js';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ChevronUp from '@lucide/svelte/icons/chevron-up';

	import { useModuleTick } from '$lib/amcf/poll.svelte';

	let { module, app }: { module: any; app: any } = $props();
	const poll = useModuleTick(() => module);

	let entities = $derived.by(() => { poll.v; return [...(module.entities || [])]; });
	let visible = $derived.by(() => { poll.v; return module.visible !== false; });
	// layout="row" puts all entities of the form into one line.
	let layout = $derived.by(() => { poll.v; return module.layout || 'column'; });
	// captionposition="top" puts the caption of every field above the field, on one line, instead of into the
	// caption column in front of it.
	let captionTop = $derived.by(() => { poll.v; return module.captionposition === 'top'; });

	// The frame of a field and its caption: the caption column (140 px) in front of the field, or the caption
	// above the field. alignStart aligns the caption with the top of a field that is taller than one line.
	function fieldClass (alignStart: boolean = false): string {
		if (captionTop) return 'flex flex-col gap-1.5 min-w-0';
		return 'grid grid-cols-[140px_1fr] gap-2 ' + (alignStart ? 'items-start' : 'items-center');
	}

	// The caption of a field. offsetClass moves a caption in the caption column down to the first line of a tall
	// field; a caption above the field needs no offset.
	function captionClass (offsetClass: string = ''): string {
		if (captionTop) return 'text-sm text-muted-foreground whitespace-nowrap';
		return 'text-sm text-muted-foreground ' + offsetClass;
	}

	// The box of a field of one line under its caption: as high as a menu (36 px), so that the switches, edits and
	// menus of a row of fields stand on one height. A field in the caption column keeps its own height.
	function controlRowClass (): string {
		return captionTop ? 'h-9' : '';
	}

	// Under its caption a menu takes less padding, so that a row of narrow cells holds its longest item.
	function triggerClass (): string {
		return captionTop ? 'h-8 text-sm px-2 gap-1.5' : 'h-8 text-sm';
	}

	// dataObject is a plain object outside Svelte's reactivity graph. Local edits bump
	// editTick so sibling controls sharing the value (slider + number box) redraw at once.
	let editTick = $state(0);

	function d(entity: any): any { poll.v; editTick; return entity?.dataObject || {}; }

	function setValue (entity: any, value: any) {
		entity.dataObject.value = value;
		editTick++;
	}

	function fireChangeEvent (entity: any) {
		if (!entity?.dataObject?.changeevent || !app) return;
		const formvalues = app.assembleFormValues ? app.assembleFormValues([entity.uuid]) : {};
		app.triggerUIEvent(entity.dataObject.changeevent, entity.uuid, formvalues);
	}

	function onEditBlur (entity: any) {
		fireChangeEvent(entity);
	}

	function onEditEnter (entity: any, e: KeyboardEvent) {
		if (e.key === 'Enter') fireChangeEvent(entity);
	}

	function onSwitchChange (entity: any, checked: boolean) {
		// Read-only switches reflect state but must never be changed by the user.
		if (d(entity).readonly) return;
		setValue(entity, checked);
		fireChangeEvent(entity);
	}

	function onComboChange (entity: any, value: string) {
		setValue(entity, value);
		fireChangeEvent(entity);
	}

	function onActionCancel (entity: any) {
		if (entity.dataObject.cancelevent && app) {
			app.triggerUIEvent(entity.dataObject.cancelevent, module.uuid, {});
		}
	}

	function onActionSubmit (entity: any) {
		if (entity.dataObject.submitevent && app) {
			const formvalues = app.assembleFormValues ? app.assembleFormValues(module.entities.map((e: any) => e.uuid)) : {};
			app.triggerUIEvent(entity.dataObject.submitevent, module.uuid, formvalues);
		}
	}

	function toBool (v: any): boolean {
		return v === true || v === '1' || v === 'true';
	}

	// A step of a numeric stepper (its arrows or the arrow keys) changed the value of a number field.
	function onStepped (entity: any, text: string) {
		setValue(entity, text);
		fireChangeEvent(entity);
	}

	// Visible lines of a memo, 0 for the default height.
	function memoRows (entity: any): number {
		const rows = parseInt(String(d(entity).rows ?? '0'), 10);
		return (Number.isFinite(rows) && rows > 0) ? rows : 0;
	}

	// A memo with autoscroll follows text that is appended at its end, like a log: after every change of its
	// text it shows the end, as long as the user has not scrolled up. Scrolling back to the end follows again.
	function followEnd (node: HTMLTextAreaElement, params: { enabled: boolean; text: string }) {
		let atEnd = true;
		const onScroll = () => { atEnd = (node.scrollTop + node.clientHeight >= node.scrollHeight - 4); };
		const follow = (current: { enabled: boolean; text: string }) => {
			if (current.enabled && atEnd)
				requestAnimationFrame(() => { node.scrollTop = node.scrollHeight; });
		};
		node.addEventListener('scroll', onScroll);
		follow(params);
		return {
			update: follow,
			destroy: () => node.removeEventListener('scroll', onScroll)
		};
	}

	let sectionOpen: Record<string, boolean> = $state({});

	function toggleSection (uuid: string, defaultOpen: boolean) {
		if (sectionOpen[uuid] === undefined) sectionOpen[uuid] = defaultOpen;
		sectionOpen[uuid] = !sectionOpen[uuid];
	}

	function isSectionOpen (uuid: string, defaultOpen: boolean): boolean {
		return sectionOpen[uuid] === undefined ? defaultOpen : sectionOpen[uuid];
	}
</script>

{#snippet formField(entity: any)}
	<!-- edit -->
	{#if entity.type === 'edit'}
		<div class={fieldClass()}>
			<Label class={captionClass()}>{entity.caption}</Label>
			<div class="flex items-center gap-1 {controlRowClass()}">
				{#if d(entity).prefix}
					<span class="text-xs text-muted-foreground">{d(entity).prefix}</span>
				{/if}
				<Input
					value={d(entity).value || ''}
					disabled={d(entity).disabled}
					readonly={d(entity).readonly}
					class="h-8 text-sm"
					onblur={() => onEditBlur(entity)}
					onkeydown={(e: KeyboardEvent) => onEditEnter(entity, e)}
					oninput={(e: Event) => { setValue(entity, (e.target as HTMLInputElement).value); }}
				/>
				{#if d(entity).suffix}
					<span class="text-xs text-muted-foreground">{d(entity).suffix}</span>
				{/if}
			</div>
		</div>

	<!-- switch -->
	{:else if entity.type === 'switch'}
		<div class={fieldClass()}>
			<Label class={captionClass()}>{entity.caption}</Label>
			<div class="flex items-center gap-2 {controlRowClass()}">
				<Switch
					checked={toBool(d(entity).value)}
					onCheckedChange={(v: boolean) => onSwitchChange(entity, v)}
					disabled={d(entity).disabled}
					aria-readonly={d(entity).readonly}
					class={d(entity).readonly ? 'pointer-events-none' : ''}
				/>
				<span class="text-sm">{toBool(d(entity).value) ? 'On' : 'Off'}</span>
			</div>
		</div>

	<!-- memo -->
	{:else if entity.type === 'memo'}
		<div class={fieldClass(true)}>
			<Label class={captionClass('pt-2')}>{entity.caption}</Label>
			<textarea
				class="flex {memoRows(entity) > 0 ? '' : 'min-h-[80px]'} w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				rows={memoRows(entity) > 0 ? memoRows(entity) : undefined}
				use:followEnd={{ enabled: toBool(d(entity).autoscroll), text: d(entity).value || '' }}
				value={d(entity).value || ''}
				disabled={d(entity).disabled}
				readonly={d(entity).readonly}
				onblur={() => onEditBlur(entity)}
				oninput={(e: Event) => { setValue(entity, (e.target as HTMLTextAreaElement).value); }}
			></textarea>
		</div>

	<!-- combobox / select -->
	{:else if entity.type === 'combobox'}
		<div class={fieldClass()}>
			<Label class={captionClass()}>{entity.caption}</Label>
			<Select.Root
				type="single"
				value={String(d(entity).value ?? '')}
				onValueChange={(v: string) => onComboChange(entity, v)}
				disabled={d(entity).disabled}
			>
			<Select.Trigger class={triggerClass()}>
				{@const selectedItem = (d(entity).items || []).find((i: any) => String(typeof i === 'string' ? i : i.value) === String(d(entity).value ?? ''))}
				{selectedItem ? (typeof selectedItem === 'string' ? selectedItem : selectedItem.text || selectedItem.value) : (d(entity).value != null && d(entity).value !== '' ? String(d(entity).value) : 'Select...')}
			</Select.Trigger>
			<Select.Content>
				{#each (d(entity).items || entity.items || []) as item (typeof item === 'string' ? item : item.value)}
					<Select.Item value={String(typeof item === 'string' ? item : item.value)}>
						{typeof item === 'string' ? item : item.text || item.value}
					</Select.Item>
				{/each}
			</Select.Content>
			</Select.Root>
		</div>

	<!-- number -->
	{:else if entity.type === 'number'}
		<div class={fieldClass()}>
			<Label class={captionClass()}>{entity.caption}</Label>
			<div class="flex items-center gap-1 {controlRowClass()}" style={d(entity).inputwidth ? `width:${d(entity).inputwidth}` : ''}>
				{#if toBool(d(entity).stepbuttons)}
					{@render stepperField(entity, 'w-full')}
				{:else}
				<Input
					type="number"
					value={d(entity).value || ''}
					disabled={d(entity).disabled}
					readonly={d(entity).readonly}
					min={d(entity).minvalue}
					max={d(entity).maxvalue}
					step={d(entity).step}
					class="h-8 text-sm w-full"
					onblur={() => onEditBlur(entity)}
					onkeydown={(e: KeyboardEvent) => onEditEnter(entity, e)}
					oninput={(e: Event) => { setValue(entity, (e.target as HTMLInputElement).value); }}
				/>
				{/if}
				{#if d(entity).unit}
					<span class="text-xs text-muted-foreground">{d(entity).unit}</span>
				{/if}
			</div>
		</div>

	<!-- slider -->
	{:else if entity.type === 'slider'}
		<div class={fieldClass(true)}>
			<Label class={captionClass('pt-1')}>{entity.caption}</Label>
			<div class="flex flex-col">
				<div class="flex items-center gap-3">
					<input
						type="range"
						class="flex-1 accent-primary"
						value={d(entity).value || 0}
						min={parseFloat(d(entity).minvalue) || 0}
						max={parseFloat(d(entity).maxvalue) || 100}
						step={parseFloat(d(entity).step) || 1}
						disabled={d(entity).disabled}
						oninput={(e: Event) => { setValue(entity, (e.target as HTMLInputElement).value); }}
						onchange={() => onEditBlur(entity)}
					/>
					<!-- editable numeric override: shares the slider's value for precise entry.
					     Width is configurable via the "inputwidth" attribute (e.g. "8rem", "120px"). -->
					<div class="flex items-center gap-1.5 shrink-0" style={`width:${d(entity).inputwidth || '8rem'}`}>
						<Input
							type="number"
							class="h-9 w-full text-base text-right tabular-nums px-2"
							value={d(entity).value ?? ''}
							min={parseFloat(d(entity).minvalue)}
							max={parseFloat(d(entity).maxvalue)}
							step={parseFloat(d(entity).step) || 1}
							disabled={d(entity).disabled}
							oninput={(e: Event) => { setValue(entity, (e.target as HTMLInputElement).value); }}
							onblur={() => onEditBlur(entity)}
							onkeydown={(e: KeyboardEvent) => onEditEnter(entity, e)}
						/>
						{#if d(entity).unit}
							<span class="text-xs text-muted-foreground">{d(entity).unit}</span>
						{/if}
					</div>
				</div>
			</div>
		</div>

	<!-- datetime -->
	{:else if entity.type === 'datetime'}
		<div class={fieldClass()}>
			<Label class={captionClass()}>{entity.caption}</Label>
			<Input
				type={d(entity).mode === 'time' ? 'time' : d(entity).mode === 'date' ? 'date' : 'datetime-local'}
				value={d(entity).value || ''}
				disabled={d(entity).disabled}
				readonly={d(entity).readonly}
				class="h-8 text-sm"
				onchange={(e: Event) => { setValue(entity, (e.target as HTMLInputElement).value); fireChangeEvent(entity); }}
			/>
		</div>

	<!-- multiselect -->
	{:else if entity.type === 'multiselect'}
		<div class={fieldClass()}>
			<Label class={captionClass()}>{entity.caption}</Label>
		<div class="flex flex-wrap gap-1 p-1 border rounded-md min-h-[32px]">
			{#each (d(entity).items || entity.items || []) as item}
					{@const val = typeof item === 'string' ? item : item.value}
					{@const selected = (() => { try { const arr = JSON.parse(d(entity).value || '[]'); return Array.isArray(arr) && arr.includes(val); } catch { return false; } })()}
					<button
						class="px-2 py-0.5 rounded text-xs transition-colors {selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
						onclick={() => {
							let arr: string[] = [];
							try { arr = JSON.parse(entity.dataObject?.value || '[]'); } catch {}
							if (!Array.isArray(arr)) arr = [];
							if (arr.includes(val)) arr = arr.filter((v: string) => v !== val);
							else arr.push(val);
							setValue(entity, JSON.stringify(arr));
							fireChangeEvent(entity);
						}}
					>
						{typeof item === 'string' ? item : item.text || item.value}
					</button>
				{/each}
			</div>
		</div>

	<!-- calculated (read-only) -->
	{:else if entity.type === 'calculated'}
		<div class={fieldClass()}>
			<Label class={captionClass()}>{entity.caption}</Label>
			<Badge variant="outline" class="w-fit">
				{d(entity).value || ''}
				{#if d(entity).unit}
					<span class="ml-1 text-muted-foreground">{d(entity).unit}</span>
				{/if}
			</Badge>
		</div>

	<!-- section -->
	{:else if entity.type === 'section'}
		{@const collapsible = d(entity).collapsible !== false}
		{@const defaultOpen = d(entity).defaultOpen !== false}
		{@const open = isSectionOpen(entity.uuid, defaultOpen)}
		<div class="border rounded-md overflow-hidden">
			{#if collapsible}
				<button
					class="w-full flex items-center justify-between px-3 py-2 bg-muted hover:bg-muted/80 transition-colors text-left"
					onclick={() => toggleSection(entity.uuid, defaultOpen)}
				>
					<span class="text-sm font-medium">{entity.caption}</span>
					{#if open}
						<ChevronUp class="h-4 w-4 text-muted-foreground" />
					{:else}
						<ChevronDown class="h-4 w-4 text-muted-foreground" />
					{/if}
				</button>
			{:else}
				<div class="px-3 py-2 bg-muted">
					<span class="text-sm font-medium">{entity.caption}</span>
				</div>
			{/if}
			{#if !collapsible || open}
				<div class="p-3 flex flex-col gap-3">
					{#each (entity.entities || []) as child (child.uuid)}
						{@render formField(child)}
					{/each}
				</div>
			{/if}
		</div>

	<!-- actionbar -->
	{:else if entity.type === 'actionbar'}
		<div class="flex justify-end gap-2 pt-2 border-t">
			{#if d(entity).cancelevent}
				<Button variant="outline" onclick={() => onActionCancel(entity)}>
					{d(entity).cancelcaption || 'Cancel'}
				</Button>
			{/if}
			{#if d(entity).submitevent}
				<Button onclick={() => onActionSubmit(entity)}>
					{d(entity).submitcaption || 'Save'}
				</Button>
			{/if}
		</div>
	{/if}
{/snippet}

<!-- The field of a number entity with stepbuttons: a numeric stepper, the field with the arrows up and down at its
     right end inside the same frame. The field takes text, so that a value that is no number reaches the event
     handler as it was typed instead of as an empty field. -->
{#snippet stepperField(entity: any, widthClass: string)}
	<NumericStepper
		value={d(entity).value ?? ''}
		min={d(entity).minvalue}
		max={d(entity).maxvalue}
		step={d(entity).step}
		disabled={d(entity).disabled}
		readonly={d(entity).readonly}
		ariaLabel={entity.caption}
		class={widthClass}
		oninput={(text: string) => { setValue(entity, text); }}
		onvaluechange={(text: string) => onStepped(entity, text)}
		onblur={() => onEditBlur(entity)}
		onkeydown={(e: KeyboardEvent) => onEditEnter(entity, e)}
	/>
{/snippet}

<!-- An entity of a form with layout="row": its caption and its field inline. showCaption is false for the first
     field, whose caption stands in the caption column. -->
{#snippet inlineField(entity: any, showCaption: boolean)}
	{#if (entity.type === 'number') && toBool(d(entity).stepbuttons)}
		{#if showCaption && entity.caption}
			<Label class="text-sm text-muted-foreground whitespace-nowrap">{entity.caption}</Label>
		{/if}
		{@render stepperField(entity, 'w-28')}
		{#if d(entity).unit}
			<span class="text-xs text-muted-foreground">{d(entity).unit}</span>
		{/if}
	{:else if entity.type === 'edit'}
		{#if showCaption && entity.caption}
			<Label class="text-sm text-muted-foreground whitespace-nowrap">{entity.caption}</Label>
		{/if}
		{#if d(entity).prefix}
			<span class="text-xs text-muted-foreground">{d(entity).prefix}</span>
		{/if}
		<Input
			value={d(entity).value || ''}
			disabled={d(entity).disabled}
			readonly={d(entity).readonly}
			class="h-8 w-24 text-sm"
			aria-label={entity.caption}
			onblur={() => onEditBlur(entity)}
			onkeydown={(e: KeyboardEvent) => onEditEnter(entity, e)}
			oninput={(e: Event) => { setValue(entity, (e.target as HTMLInputElement).value); }}
		/>
		{#if d(entity).suffix}
			<span class="text-xs text-muted-foreground">{d(entity).suffix}</span>
		{/if}
	{:else}
		<div class="flex-1 min-w-[200px]">{@render formField(entity)}</div>
	{/if}
{/snippet}

{#if visible}
	{#if layout === 'row' && captionTop}
		<!-- A row of fields with their captions above them: no caption column, every field stands under its
		     caption, and the captions of the row stand on one line. -->
		<div class="flex flex-wrap items-start gap-2 w-full">
			{#each entities as entity (entity.uuid)}
				{#if (entity.type === 'edit') || ((entity.type === 'number') && toBool(d(entity).stepbuttons))}
					<div class="flex flex-col gap-1.5">
						<Label class={captionClass()}>{entity.caption || ' '}</Label>
						<div class="flex items-center gap-1">{@render inlineField(entity, false)}</div>
					</div>
				{:else}
					{@render inlineField(entity, false)}
				{/if}
			{/each}
		</div>
	{:else if layout === 'row'}
		<!-- The caption of the first field takes the caption column of the other forms, so that the first field
		     starts on the same line as their fields. The other fields follow in the same line. -->
		{@const leadsWithEdit = (entities.length > 0) && ((entities[0].type === 'edit') || ((entities[0].type === 'number') && toBool(d(entities[0]).stepbuttons)))}
		<div class="grid grid-cols-[140px_1fr] items-center gap-2 w-full">
			<Label class="text-sm text-muted-foreground">{leadsWithEdit ? (entities[0].caption || '') : ''}</Label>
			<div class="flex flex-wrap items-center gap-2">
				{#each entities as entity, index (entity.uuid)}
					{@render inlineField(entity, !(leadsWithEdit && index === 0))}
				{/each}
			</div>
		</div>
	{:else}
		<div class="flex flex-col gap-3 w-full">
			{#each entities as entity (entity.uuid)}
				{@render formField(entity)}
			{/each}
		</div>
	{/if}
{/if}
