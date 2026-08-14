export function animatePiece(piece, start, end, duration) {
    const scene = piece.scene;
    const camera = piece.camera;
    const renderer = piece.renderer;

    const startTransform = new THREE.Matrix4().extractRotation(piece.matrixWorld);
    const endTransform = new THREE.Matrix4().extractRotation(end.matrixWorld);

    const startTranslation = new THREE.Vector3().setFromMatrixPosition(start.matrixWorld);
    const endTranslation = new THREE.Vector3().setFromMatrixPosition(end.matrixWorld);

    const startScale = new THREE.Vector3().setFromMatrixScale(start.matrixWorld);
    const endScale = new THREE.Vector3().setFromMatrixScale(end.matrixWorld);

    const startRotation = new THREE.Euler().setFromMatrix(startTransform);
    const endRotation = new THREE.Euler().setFromMatrix(endTransform);

    const animation = new THREE.AnimationClip('move', duration, [
        new THREE.Interpolant(startTranslation, endTranslation, THREE.LinearInterpolant),
        new THREE.Interpolant(startRotation, endRotation, THREE.LinearInterpolant),
        new THREE.Interpolant(startScale, endScale, THREE.LinearInterpolant)
    ]);

    const action = new THREE.AnimationAction('move', animation);
    action.setTarget(piece);

    const mixer = new THREE.AnimationMixer(piece);
    mixer.clipAction('move', action).play();

    const clock = new THREE.Clock();
    let time = 0;

    function animate() {
        time += clock.getDelta();
        renderer.render(scene, camera);
        if (time < duration) {
            requestAnimationFrame(animate);
        }
    }

    animate();
}