import { google } from 'googleapis';

console.log('GOOGLE_SERVICE_ACCOUNT_JSON exists:', !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
console.log('GOOGLE_SHEET_ID:', process.env.GOOGLE_SHEET_ID);
import { AppError } from '../utils/AppError';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export class GoogleSheetsService {
  private auth: any;
  private sheets: any;
  private spreadsheetId: string;

  constructor() {
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID || '';
    const credentialsJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    console.log('Raw GOOGLE_SERVICE_ACCOUNT_JSON length:', credentialsJson?.length);
    if (!credentialsJson) {
      throw new AppError('GOOGLE_SERVICE_ACCOUNT_JSON não configurado.', 500);
    }
    let credentials;
    try {
      credentials = JSON.parse(credentialsJson);
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
      console.log('Private key after \\n replacement:', credentials.private_key.substring(0, 50) + '...' + credentials.private_key.substring(credentials.private_key.length - 50));
      console.log('Private key snippet:', credentials.private_key.substring(0, 30), '...', credentials.private_key.substring(credentials.private_key.length - 30));
      console.log('Parsed credentials successfully.');
    } catch (parseError: any) {
      console.error('Erro ao fazer JSON.parse de GOOGLE_SERVICE_ACCOUNT_JSON:', parseError.message);
      throw new AppError('Erro ao processar credenciais do Google Sheets', 500);
    }

    // Configuração de autenticação via Service Account usando o arquivo JSON
    console.log('Attempting to initialize GoogleAuth with credentials:', { client_email: credentials.client_email, project_id: credentials.project_id });
    this.auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    // Log para verificar se o objeto GoogleAuth foi criado com sucesso
    console.log("GoogleAuth object created successfully.");

    this.sheets = google.sheets({ version: 'v4', auth: this.auth });
    console.log("Google Sheets API client initialized.");
  }

  /**
   * Lê todos os produtos da planilha do Google Sheets.
   * Assume que a primeira linha é o cabeçalho e as colunas são: SKU, Nome, Preço, Quantidade.
   */
  async getProductsFromSheet(range = 'Página1!A2:H') {
  try {
    const response = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range,
    });
    const rows = response.data.values;
    if (!rows || rows.length === 0) {
      return [];
    }
    return rows.map((row: any[]) => ({
      sku: row[0] || '',
      name: row[1] || '',
      price: row[6] ? parseFloat(row[6].toString().replace('R$', '').replace('.', '').replace(',', '.').trim()) : 0,
      quantity: row[7] ? parseInt(row[7].toString(), 10) : 0,
    }));
  } catch (error: any) {
    console.error('Erro ao ler planilha do Google Sheets:', error.message);
    throw new AppError('Falha na integração com Google Sheets', 502);
  }
}

  /**
   * Atualiza a quantidade de um produto na planilha com base no SKU.
   */
  async updateStockInSheet(sku: string, newQuantity: number) {
    try {
      // Primeiro, localizamos a linha do SKU
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: 'Página1!A2:A',
      });

      const rows = response.data.values;
      if (!rows) return;

      const rowIndex = rows.findIndex((row: any[]) => row[0] === sku);
      if (rowIndex === -1) return;

      // Coluna D é a quantidade (índice 3 na planilha de 1-base)
      const actualRow = rowIndex + 2;
      const range = `Estoque!D${actualRow}`;

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[newQuantity]],
        },
      });
    } catch (error: any) {
      console.error(`Erro ao atualizar SKU ${sku} no Google Sheets:`, error.message);
    }
  }

  /**
   * Adiciona um novo produto à planilha.
   */
  async addProductToSheet(product: any) {
    try {
      const range = 'Estoque!A2:D';
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[product.sku, product.name, product.price, product.quantity]],
        },
      });
    } catch (error: any) {
      console.error('Erro ao adicionar produto ao Google Sheets:', error.message);
    }
  }
}
