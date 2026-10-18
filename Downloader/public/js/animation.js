gsap.from("#download-btn", {
    opacity: 0,
    x: 100,
    duration: 1.2,
    delay: 0.3,
    ease: "power4.out"
});

gsap.from(".main h1", {
    opacity: 0,
    y: 25,
    duration: 1.5,
    delay: 0.3,
    ease: "power3.out"
});

gsap.from(".main h2", {
    opacity: 0,
    y: 35,
    duration: 1.2,
    delay: 0.5,
    ease: "power2.out"
});

gsap.from(".cadre input", {
    opacity: 0,
    y: 5,
    scale: 0,
    duration: 1.2,
    delay: 0.3,
    ease: "power4.out"
});