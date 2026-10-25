import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/nunito';
import './styles/main.css';
import './styles/menu.css';
import { App } from './ui/app';

const root = document.getElementById('app')!;
const app = new App(root);
const params = new URLSearchParams(location.search);
const stage = Number(params.get('stage'));
if (params.has('qa')) app.save.unlockAll();
if (stage && app.save.isUnlocked(stage)) app.playStage(stage);
else app.showTitle();
