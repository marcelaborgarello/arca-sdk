const fs = require('fs');
const file = 'c:/Users/impre/dev/arca-sdk/src/services/wsfe.ts';
let content = fs.readFileSync(file, 'utf8');

// 1. Add import
if (!content.includes('InvoiceOptional')) {
    content = content.replace(
        `    PointOfSale,\n} from '../types/wsfe';`,
        `    PointOfSale,\n    InvoiceOptional,\n} from '../types/wsfe';`
    );
}

// 2. Add `optionals?: InvoiceOptional[];` to all public methods taking a `params` object
content = content.replace(/    \}\): Promise<CAEResponse> \{/g, '        optionals?: InvoiceOptional[];\n    }): Promise<CAEResponse> {');

// 3. Add to `issueInvoiceWithVAT` parameters
content = content.replace(
    `            includesVAT?: boolean;\n        }\n    ): Promise<CAEResponse> {`,
    `            includesVAT?: boolean;\n            optionals?: InvoiceOptional[];\n        }\n    ): Promise<CAEResponse> {`
);

// 4. Add to `issueInvoiceWithoutVAT` parameters
content = content.replace(
    `            buyer?: Buyer;\n        }\n    ): Promise<CAEResponse> {`,
    `            buyer?: Buyer;\n            optionals?: InvoiceOptional[];\n        }\n    ): Promise<CAEResponse> {`
);

// 5. Pass `optionals: params.optionals` in `issueInvoiceWithVAT`
content = content.replace(
    `            includesVAT,\n        });\n    }`,
    `            includesVAT,\n            optionals: params.optionals,\n        });\n    }`
);

// 6. Pass `optionals: params.optionals` in `issueInvoiceWithoutVAT`
content = content.replace(
    `            associatedInvoices: params.associatedInvoices,\n        });\n    }`,
    `            associatedInvoices: params.associatedInvoices,\n            optionals: params.optionals,\n        });\n    }`
);

// 7. Update `issueDocument(request: IssueInvoiceRequest)` - Wait, `request` already includes `optionals`. 
// Need to add `optionals: request.optionals,` to `buildCAERequest({ ... })` inside `issueDocument`
content = content.replace(
    `            vatData: request.vatData,\n        });\n\n        // 4. Send to ARCA`,
    `            vatData: request.vatData,\n            optionals: request.optionals,\n        });\n\n        // 4. Send to ARCA`
);

// 8. Update `buildCAERequest` arguments
content = content.replace(
    `        vatData?: IssueInvoiceRequest['vatData'];\n    }): string {`,
    `        vatData?: IssueInvoiceRequest['vatData'];\n        optionals?: InvoiceOptional[];\n    }): string {`
);

// 9. Implement `Opcionales` XML logic in `buildCAERequest`
const optLogic = `
        let optXml = '';
        if (params.optionals && params.optionals.length > 0) {
            optXml = '<ar:Opcionales>';
            params.optionals.forEach(opt => {
                optXml += \`
        <ar:Opcional>
          <ar:Id>\${opt.id}</ar:Id>
          <ar:Valor>\${opt.value}</ar:Valor>
        </ar:Opcional>\`;
            });
            optXml += '\\n      </ar:Opcionales>';
        }`;

content = content.replace(
    `        let asocXml = '';`,
    optLogic + `\n\n        let asocXml = '';`
);

// 10. Append `\${optXml}` in FECAEDetRequest template
content = content.replace(
    `            \${asocXml}\n            \${vatXml}\n          </ar:FECAEDetRequest>`,
    `            \${asocXml}\n            \${vatXml}\n            \${optXml}\n          </ar:FECAEDetRequest>`
);

// 11. Parse `Opcionales` in `getInvoice`
const parseOpt = `
        const det = data.ResultGet;
        
        let optionals;
        if (det.Opcionales && det.Opcionales.Opcional) {
            const optList = Array.isArray(det.Opcionales.Opcional) ? det.Opcionales.Opcional : [det.Opcionales.Opcional];
            optionals = optList.map((o: any) => ({ id: String(o.Id), value: String(o.Valor) }));
        }

        return {`;

content = content.replace(
    `        const det = data.ResultGet;\n        return {`,
    parseOpt
);

// 12. Return `optionals` in `getInvoice` object
content = content.replace(
    `            result: det.Resultado as 'A' | 'R',\n        };\n    }`,
    `            result: det.Resultado as 'A' | 'R',\n            optionals,\n        };\n    }`
);

fs.writeFileSync(file, content);
console.log('Done.');
