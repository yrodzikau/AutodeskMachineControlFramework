<!--
	Numeric stepper: a number field with two narrow arrows, one above the other, at its right end inside the same
	frame. The upper arrow and the arrow key up step the value up by step, the lower arrow and the arrow key down
	step it down; both keep it within min and max, and an arrow that would not change the value is disabled.
	The field takes text, so that a value that is no number reaches the owner as it was typed.

	oninput reports every typed change, onvaluechange every change by a step. Both pass the text of the field.
-->
<script lang="ts">
	import ChevronUp from '@lucide/svelte/icons/chevron-up';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { cn } from '$lib/utils.js';

	type NumberLike = number | string | null | undefined;

	let {
		value = '',
		min = null,
		max = null,
		step = 1,
		disabled = false,
		readonly = false,
		ariaLabel = '',
		class: className = '',
		oninput,
		onvaluechange,
		onblur,
		onkeydown
	}: {
		value?: NumberLike;
		min?: NumberLike;
		max?: NumberLike;
		step?: NumberLike;
		disabled?: boolean;
		readonly?: boolean;
		ariaLabel?: string;
		class?: string;
		oninput?: (text: string) => void;
		onvaluechange?: (text: string) => void;
		onblur?: () => void;
		onkeydown?: (e: KeyboardEvent) => void;
	} = $props();

	function numberOf (candidate: NumberLike): number | null {
		if ((candidate === undefined) || (candidate === null)) return null;
		const text = String(candidate).trim();
		if (text === '') return null;
		const number = Number(text);
		return Number.isFinite(number) ? number : null;
	}

	// The value one step up (direction 1) or down (-1), kept within min and max. A field without a number starts
	// at its bound. null if the step does not change the value.
	function steppedValue (direction: number): number | null {
		const stepValue = numberOf(step);
		const stepSize = ((stepValue !== null) && (stepValue > 0)) ? stepValue : 1;
		const lower = numberOf(min);
		const upper = numberOf(max);
		const current = numberOf(value);

		let next = (current !== null) ? current + direction * stepSize : ((direction > 0) ? (lower ?? 0) : (upper ?? 0));
		if ((lower !== null) && (next < lower)) next = lower;
		if ((upper !== null) && (next > upper)) next = upper;
		// No floating point noise from fractional steps.
		const decimals = (String(stepSize).split('.')[1] || '').length;
		next = Number(next.toFixed(decimals));

		return ((current !== null) && (next === current)) ? null : next;
	}

	let canIncrease = $derived(!disabled && !readonly && (steppedValue(1) !== null));
	let canDecrease = $derived(!disabled && !readonly && (steppedValue(-1) !== null));

	function stepBy (direction: number) {
		if ((direction > 0) ? !canIncrease : !canDecrease) return;
		const next = steppedValue(direction);
		if (next !== null) onvaluechange?.(String(next));
	}

	function onKey (e: KeyboardEvent) {
		if ((e.key === 'ArrowUp') || (e.key === 'ArrowDown')) {
			e.preventDefault();
			stepBy((e.key === 'ArrowUp') ? 1 : -1);
			return;
		}
		onkeydown?.(e);
	}
</script>

<div
	data-slot="numeric-stepper"
	data-numeric-stepper
	class={cn(
		'border-input bg-background dark:bg-input/30 flex h-8 min-w-0 items-stretch overflow-hidden rounded-md border shadow-xs transition-[color,box-shadow]',
		'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
		disabled && 'cursor-not-allowed opacity-50',
		className
	)}
>
	<input
		type="text"
		inputmode="numeric"
		class="placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground min-w-0 flex-1 bg-transparent px-3 text-sm outline-none disabled:cursor-not-allowed"
		value={value ?? ''}
		{disabled}
		{readonly}
		aria-label={ariaLabel}
		oninput={(e: Event) => oninput?.((e.target as HTMLInputElement).value)}
		onkeydown={onKey}
		onblur={() => onblur?.()}
	/>
	<!-- The arrows are not in the tab order: the field steps with the arrow keys. Their hover uses muted, not accent:
	     a machine configuration may set accent to a dark colour without a light text colour for it. -->
	<div class="border-input flex w-5 shrink-0 flex-col border-l">
		<button
			type="button"
			tabindex="-1"
			class="text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-input/50 flex flex-1 items-center justify-center transition-colors disabled:pointer-events-none disabled:opacity-30"
			aria-label={'Increase ' + (ariaLabel || 'value')}
			disabled={!canIncrease}
			onclick={() => stepBy(1)}
		>
			<ChevronUp class="h-3 w-3" />
		</button>
		<button
			type="button"
			tabindex="-1"
			class="border-input text-muted-foreground hover:bg-muted hover:text-foreground dark:hover:bg-input/50 flex flex-1 items-center justify-center border-t transition-colors disabled:pointer-events-none disabled:opacity-30"
			aria-label={'Decrease ' + (ariaLabel || 'value')}
			disabled={!canDecrease}
			onclick={() => stepBy(-1)}
		>
			<ChevronDown class="h-3 w-3" />
		</button>
	</div>
</div>
