import { WsaaService } from './src/auth/wsaa';
import * as fs from 'fs';

async function testWsaaTicket() {
  const wsaaPadron = new WsaaService({
    environment: 'homologacion',
    cuit: '20123456789', // fake cuit
    cert: 'DUMMY_CERT', // We might need a real cert if we want to actually get a ticket
    key: 'DUMMY_KEY',
    service: 'ws_sr_padron_a13',
  });

  console.log("Config WSAA Padron:", wsaaPadron['config'].service);
}
testWsaaTicket();
