import { WSAA_ENDPOINTS } from './src/constants/endpoints';

async function testWsaa() {
  const urlHomo = WSAA_ENDPOINTS.homologacion;
  console.log(`Probando ${urlHomo}?wsdl...`);
  try {
    const res = await fetch(`${urlHomo}?wsdl`);
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response length: ${text.length}`);
  } catch (err) {
    console.error('Error homologacion:', err);
  }

  const urlProd = WSAA_ENDPOINTS.produccion;
  console.log(`Probando ${urlProd}?wsdl...`);
  try {
    const res = await fetch(`${urlProd}?wsdl`);
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response length: ${text.length}`);
  } catch (err) {
    console.error('Error produccion:', err);
  }
}

testWsaa();
