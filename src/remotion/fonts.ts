import '@fontsource/montserrat/800.css';
import '@fontsource/montserrat/900.css';
import '@fontsource/tiktok-sans/800.css';
import '@fontsource/anton/400.css';
import '@fontsource/dm-serif-display/400.css';
import '@fontsource/archivo-black/400.css';
import '@fontsource/poppins/300.css';
import '@fontsource/poppins/700.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/700.css';
import '@fontsource/inter/900.css';
import '@fontsource/allura/400.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/fraunces/900.css';
import '@fontsource/fraunces/900-italic.css';
import '@fontsource/bodoni-moda/500.css';
import '@fontsource/bodoni-moda/700.css';

// Fonts a user can pick as an override. All free / open licensed.
export const FONT_CHOICES = [
	'Montserrat',
	'TikTok Sans',
	'Anton',
	'Inter',
	'Poppins',
	'Plus Jakarta Sans',
	'Archivo Black',
	'DM Serif Display',
	'Fraunces',
	'Bodoni Moda',
	'Allura',
] as const;

const FONT_SPECS = [
	'900 40px Montserrat',
	'800 40px Montserrat',
	'800 40px "TikTok Sans"',
	'400 40px Anton',
	'400 40px "DM Serif Display"',
	'400 40px "Archivo Black"',
	'300 40px Poppins',
	'700 40px Poppins',
	'500 40px Inter',
	'700 40px Inter',
	'900 40px Inter',
	'400 40px Allura',
	'700 40px "Plus Jakarta Sans"',
	'800 40px "Plus Jakarta Sans"',
	'900 40px Fraunces',
	'italic 900 40px Fraunces',
	'500 40px "Bodoni Moda"',
	'700 40px "Bodoni Moda"',
];

export const loadAllFonts = () => Promise.all(FONT_SPECS.map((f) => document.fonts.load(f)));
