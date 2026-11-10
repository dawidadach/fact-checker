// Panel boczny nie potrafi sam wyświetlić prośby o mikrofon – robi to ta karta, a zgoda obowiązuje potem w całej wtyczce.
const p = document.getElementById("p");
navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => {
  s.getTracks().forEach((t) => t.stop());
  p.textContent = "Gotowe. Wróć do panelu Fact Checker i kliknij Start. Ta karta zamknie się sama.";
  setTimeout(() => window.close(), 2500);
}, (e) => {
  p.textContent = `Brak zgody (${e.name}). Zmienisz to w ustawieniach witryny wtyczki: ikona kłódki / chrome://settings/content/microphone.`;
});
