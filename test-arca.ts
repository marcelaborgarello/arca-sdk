import { getPadronEndpoint } from './src/constants/endpoints';

async function test() {
  const urlHomo = getPadronEndpoint('homologacion');
  console.log(`Probando ${urlHomo}?wsdl...`);
  try {
    const res = await fetch(`${urlHomo}?wsdl`);
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Response length: ${text.length}`);
  } catch (err) {
    console.error('Error homologacion:', err);
  }

  const urlProd = getPadronEndpoint('produccion');
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

test();
