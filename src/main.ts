import { createApp } from './app/createApp';

createApp().catch((err) => {
  console.error(err);
  const status = document.getElementById('status');
  if (status) status.textContent = `Fatal: ${String(err)}`;
});
