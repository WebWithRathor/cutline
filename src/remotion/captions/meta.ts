// Plain data about each caption preset, safe to import from server code.

export type PresetDefaults = {primary: string; accent: string; font: string};

export type PresetMeta = {
	id: string;
	name: string;
	description: string;
	group: 'Trending' | 'From your references';
	defaults: PresetDefaults;
	demoTone: 'cool' | 'warm';
	hasBehindLayer?: boolean; // draws behind the person when a person matte is available
};

export const PRESET_META: PresetMeta[] = [
	{id: 'dynamic-minimal', name: 'Dynamic Minimal', description: 'White bold with outline, words scale in as spoken. Clean default.', group: 'Trending', defaults: {primary: '#ffffff', accent: '#ffffff', font: 'Montserrat'}, demoTone: 'cool'},
	{id: 'pill-chip', name: 'Pill / Chip', description: 'Phrase on a dark pill, spoken word jumps into a bright chip.', group: 'Trending', defaults: {primary: '#ffffff', accent: '#FFD43B', font: '"TikTok Sans"'}, demoTone: 'cool'},
	{id: 'classic-highlight', name: 'Classic Highlight', description: 'All caps, heavy outline, spoken word and keywords pop yellow.', group: 'Trending', defaults: {primary: '#ffffff', accent: '#f7c204', font: 'Anton'}, demoTone: 'cool'},
	{id: 'typewriter', name: 'Typewriter', description: 'Letters type out across each word with a cursor. Calm, explanatory.', group: 'Trending', defaults: {primary: '#ffffff', accent: '#F5D76E', font: '"DM Serif Display"'}, demoTone: 'warm'},
	{id: 'color-switch', name: 'Color-Switch', description: 'One word at a time, alternating two colors, bouncy. Best under 30s.', group: 'Trending', defaults: {primary: '#ffffff', accent: '#FF5A5F', font: '"Archivo Black"'}, demoTone: 'cool'},
	{id: 'quiet-lowercase', name: 'Quiet Lowercase', description: 'Soft single line, butter yellow, plain fade. Lifestyle feel.', group: 'Trending', defaults: {primary: '#F5D76E', accent: '#F5D76E', font: 'Poppins'}, demoTone: 'warm'},
	{id: 'shorts-clean', name: 'Shorts Clean', description: 'Bold white phrase with a thin outline in the lower third.', group: 'Trending', defaults: {primary: '#ffffff', accent: '#ffffff', font: 'Montserrat'}, demoTone: 'cool'},
	{id: 'script-heavy-duo', name: 'Script + Heavy Duo', description: 'Handwritten script words around one huge orange keyword.', group: 'From your references', defaults: {primary: '#ffffff', accent: '#F2A93B', font: 'Montserrat'}, demoTone: 'cool'},
	{id: 'smooth-rise', name: 'Smooth Rise', description: 'Words rise from behind a line with an eased bounce and blur-in.', group: 'From your references', defaults: {primary: '#ffffff', accent: '#ffffff', font: '"Plus Jakarta Sans"'}, demoTone: 'cool'},
	{id: 'safe-zone-chip', name: 'Safe-Zone Chip', description: 'One uppercase word in a lime chip under the chin; keywords land big.', group: 'From your references', defaults: {primary: '#111111', accent: '#D9FF3D', font: 'Inter'}, demoTone: 'warm'},
	{id: 'negative-space-glow', name: 'Negative-Space Glow', description: 'One glowing lowercase word in empty space above the head.', group: 'From your references', defaults: {primary: '#ffffff', accent: '#ffffff', font: 'Anton'}, demoTone: 'warm'},
	{id: 'glow-stack', name: 'Glow Stack', description: 'Stacked white bold lines, keyword in a glowing lime serif.', group: 'From your references', defaults: {primary: '#ffffff', accent: '#B9F65E', font: '"Plus Jakarta Sans"'}, demoTone: 'cool'},
	{id: 'editorial-behind', name: 'Editorial Behind', description: 'Giant red serif keyword behind the person, small serif words in front.', group: 'From your references', defaults: {primary: '#ffffff', accent: '#E3261B', font: '"Bodoni Moda"'}, demoTone: 'warm', hasBehindLayer: true},
	{id: 'blur-reveal', name: 'Blur Reveal', description: 'Left-aligned lime lines, letters resolve out of a blur.', group: 'From your references', defaults: {primary: '#C9F46B', accent: '#C9F46B', font: 'Inter'}, demoTone: 'warm'},
];

export const getPresetMeta = (id: string) => PRESET_META.find((p) => p.id === id) ?? PRESET_META[0];
