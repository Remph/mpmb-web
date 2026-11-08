import { mount } from 'svelte';
// The font ships with the app: under COEP: require-corp nothing may come from another origin.
import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/500.css';
import '@fontsource/atkinson-hyperlegible-next/700.css';
import '@fontsource/atkinson-hyperlegible-next/800.css';
// Campfire's display letters (names, card titles), remph.de's own; only that theme asks for them. Latin only.
import './fonts/recursive-latin.css';
import './app.css';
import App from './App.svelte';
import { look } from './look.svelte.ts';
import { registerOffline } from './offline/register.ts';

const target = document.getElementById('app');
if (!target) throw new Error('#app is missing in index.html');

registerOffline();
// public/look.js showed the look already; this also covers a page where that script didn't run.
look.show();

export default mount(App, { target });
