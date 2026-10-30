import { mount } from 'svelte';
// The font ships with the app: under COEP: require-corp nothing may come from another origin.
import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/500.css';
import '@fontsource/atkinson-hyperlegible-next/700.css';
import '@fontsource/atkinson-hyperlegible-next/800.css';
import './app.css';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('#app is missing in index.html');

export default mount(App, { target });
