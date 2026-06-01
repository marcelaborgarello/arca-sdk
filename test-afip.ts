async function testAfip() {
  const urlHomo = 'https://awshomo.afip.gov.ar/sr-padron/webservices/personaServiceA13';
  console.log(`Probando ${urlHomo}?wsdl...`);
  try {
    const res = await fetch(`${urlHomo}?wsdl`);
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response length: ${text.length}`);
  } catch (err) {
    console.error('Error homologacion:', err);
  }
}
testAfip();
