import { createDockerfile, createBackend, createFrontend, createPackageJson, createReadme } from './builders';

export function buildNoteTakingApp(targetDir: string) {
  const dockerfile = createDockerfile();
  const backend = createBackend();
  const frontend = createFrontend();
  const packageJson = createPackageJson();
  const readme = createReadme();
  fs.writeFileSync(path.join(targetDir, 'Dockerfile'), dockerfile);
  fs.writeFileSync(path.join(targetDir, 'backend/server.js'), backend);
  fs.writeFileSync(path.join(targetDir, 'frontend/App.js'), frontend);
  fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(packageJson, null, 2));
  fs.writeFileSync(path.join(targetDir, 'README.md'), readme);
  console.log('🎉 Note-taking app build completed:
    - Dockerfile: ' + path.join(targetDir, 'Dockerfile') + '\n    - Backend (server.js): ' + path.join(targetDir, 'backend/server.js') + '\n    - Frontend (App.js): ' + path.join(targetDir, 'frontend/App.js') + '\n    - Package JSON: ' + path.join(targetDir, 'package.json') + '\n    - README: ' + path.join(targetDir, 'README.md') + '\n');
}