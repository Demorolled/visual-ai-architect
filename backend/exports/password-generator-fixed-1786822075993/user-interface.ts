import { generatePassword, validatePassword, calculateStrength } from '../search-filter/search-filter.ts';

let generatedPasswordEl: HTMLSpanElement | null = null;

export function render(container: HTMLElement) {
  const app = document.createElement('div');
  app.className = 'app';

  const title = document.createElement('h1');
  title.textContent = 'Password Generator';
  app.appendChild(title);

  const strengthSlider = document.createElement('input');
  strengthSlider.type = 'range';
  strengthSlider.min = '1';
  strengthSlider.max = '5';
  strengthSlider.value = '3';
  strengthSlider.onchange = () => setStrength(parseInt(strengthSlider.value, 10));
  app.appendChild(strengthSlider);

  const lengthSlider = document.createElement('input');
  lengthSlider.type = 'range';
  lengthSlider.min = '6';
  lengthSlider.max = '20';
  lengthSlider.value = '12';
  lengthSlider.onchange = () => setLength(parseInt(lengthSlider.value, 10));
  app.appendChild(lengthSlider);

  generatedPasswordEl = document.createElement('span');
  generatedPasswordEl.textContent = 'Generated Password: ';
  app.appendChild(generatedPasswordEl);

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn';
  copyBtn.textContent = 'Copy Password';
  copyBtn.onclick = () => copyPassword();
  app.appendChild(copyBtn);

  const generateBtn = document.createElement('button');
  generateBtn.className = 'btn';
  generateBtn.textContent = 'Generate Password';
  generateBtn.onclick = () => {
    const password = generatePassword(parseInt(lengthSlider.value, 10));
    if (generatedPasswordEl) {
      generatedPasswordEl.textContent = 'Generated Password: ' + password;
    }
  };
  app.appendChild(generateBtn);

  container.appendChild(app);
}

function copyPassword() {
  if (!generatedPasswordEl) return;
  const text = generatedPasswordEl.textContent || '';
  const password = text.replace(/^Generated Password:\s*/, '');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(password).then(() => {
      console.log('Password copied to clipboard');
    }).catch(() => {
      fallbackCopy(password);
    });
  } else {
    fallbackCopy(password);
  }
}

function fallbackCopy(password: string) {
  try {
    const ta = document.createElement('textarea');
    ta.value = password;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    console.log('Password copied to clipboard (fallback)');
  } catch (e) {
    console.log('Copy unavailable in this environment');
  }
}

function setStrength(strength: number) {
  const strengthBar = document.getElementById('strength-bar');
  if (strengthBar) {
    strengthBar.style.width = `${strength * 10}%`;
  }
}

function setLength(length: number) {
  const lengthBar = document.getElementById('length-bar');
  if (lengthBar) {
    lengthBar.style.width = `${length * 5}%`;
  }
}
