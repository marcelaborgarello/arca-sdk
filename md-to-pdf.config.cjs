module.exports = {
    stylesheet: 'pdf-styles.css',
    pdf_options: {
        format: 'A4',
        margin: '20mm',
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<div style="font-size: 8px; margin: 0 auto; color: #94a3b8;">arca-sdk - Documentación</div>',
        footerTemplate: '<div style="font-size: 8px; margin: 0 auto; color: #94a3b8;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    },
};
