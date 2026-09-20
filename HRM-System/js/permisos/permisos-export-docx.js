// ============================================================
// PERMISOS-EXPORT-DOCX.JS — Genera la "BOLETA DE PERMISO PARA
// SALIR DEL CENTRO DE TRABAJO" como documento Word, con el MISMO
// formato (fuente, márgenes, puntos de llenado) de la plantilla
// oficial "PAPELETAS_DE_PERMISO.docx".
// ============================================================
// Antes el archivo se generaba copiando una plantilla en Google
// Sheets y exportando con exportarSpreadsheet_ (Codigo_Permisos.gs)
// — ese motor de conversión de Sheets NO respeta con exactitud la
// fuente ni los márgenes de Word, lo que causaba la distorsión.
//
// Este archivo sigue el MISMO patrón que ya usan y funcionan bien
// vacaciones-export-docx.js y licencias-export-docx.js: arma el
// .docx enteramente en el navegador con la librería "docx" (CDN,
// cargada en app.html), sin pasar por el backend ni por Sheets.
//
// Los valores de fuente/márgenes/posiciones de puntos de abajo
// fueron extraídos directamente del XML de la plantilla real
// (PAPELETAS_DE_PERMISO.docx), no inventados — por eso el
// resultado sale idéntico.
// ============================================================

window.PermisosExportDOCX = (function () {

    const FUENTE = 'Arial';
    const TAM_TITULO = 22;  // 11pt — igual que la plantilla
    const TAM_TEXTO = 20;   // 10pt — igual que la plantilla
    const PUNTO = '…';      // carácter horizontal ellipsis (el mismo que usa la plantilla)

    // Mínimo de espacios en blanco (con subrayado punteado) que
    // SIEMPRE quedan ANTES y DESPUÉS de un dato agregado — el dato
    // queda flotando sobre una línea punteada continua (subrayado
    // real de Word, no caracteres de punto), igual que si se
    // hubiera escrito a mano sobre la línea de la boleta impresa.
    // Nunca queda pegado al inicio ni al final del campo, incluso si
    // el dato es tan largo que casi no deja espacio dentro del ancho
    // original (en ese caso el campo se estira, pero los mínimos de
    // antes/después se respetan siempre).
    const MIN_ESPACIOS_ANTES_DATO = 8;
    const MIN_ESPACIOS_TRAS_DATO = 8;

    // Logo oficial (escudo UPAO), extraído directamente del PDF
    // "PAPELETAS_DE_PERMISO.pdf" para que sea el mismo logo exacto
    // que trae la boleta impresa. Se incrusta en base64 para que el
    // .docx generado sea autocontenido (no depende de Drive/red).
    const LOGO_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAEYAAABhCAIAAADk5UBdAAAACXBIWXMAAAsSAAALEgHS3X78AAASfUlEQVR42u1cUWhcV3r+NJk1wiGdyIXUdRT8G4EMIi7HC8qDpfQevaigllZvRSuXewfiPLik0b7kIV46dyDOwy5L1T7kwW7RvSTKhBa2my7rB3VbncNKsIkIPt6AFpQInwnCESw1c1tQsDS2+vDfuTOauSPNjBRaFp8HY0kzc89/zv9///d/5z/Tt7+/j9+tkT3hz6tGpbvYWDfKQinV9EciSCknR8TMZSCb+5ZM6juZXWqwBAABIBBAVH+JtbAA+F+AACnhjokTt+3YJlWj4qJRSllAkuxwlqW1aGPdKAULJUl6Eo7j/L8wqRjqQCmC9Dy4DXMqhprdzHUcVKP8TbNQcNrZtnTHKKskSe8qnKGTMGy/p/HhpxXyfOn5gVLxr/YqQaD29yr7+/t+oPb3Kl6g9vcqgVLk+R9+Wjnk09SXyvMVeb4fqP1jj152iTfH9yT7mN7UdgvumJi4OU+QCzdEuGpoEGqljgrKYsFt3oFQ60Bh+UbsqKW16NZ78wD8H8jjbFe228iZuGZAuH97DtlcqDUs3FlhtwwAggRQXDRECFYwOSIA1MBNoxo1xlgx1EopIglAb2q1goLrzNyeKy4a7x3lH/TkrsYzvu93+NLSWvTnfzs/LWnhTQeZ/mKoXzgnHv92++PPtysVfP347OO97b970/l6b+DqK2env3vx0ov9l17sR6YfgCDi//DQmxoZvHJlevOL7ek/Plv8+XYFmH55IFw1b/6Fc/lS39w/qCjqk4K+RXgorUXfe2ve92TBdfSmfvBQAFhaNwuuUwy1tVi4IYB6timtRbs7hrE7cb9Tp5szUqi1tSAC/wuABgHAOS8uXJuXJNvhynFNYnsCX7qOE2qtFIhQcB2eUMF1EqdidGYzqGWJG80rzNZDaGY0N1HUBCwUnFDrQKnXp+ZmLqM3q442qbQWvf3evO9J13FKaxEAnjQRJOHBaTEzmuP1ZrYgJWgQzvm07FSNdNk8eCg4KcsGw8JQu7NCl02wAm883igAF67NSylboeUYIL5XoRpSB4HyAxUDtK8S+P7w04rnKy9Q6ssYxDsae5UgUNJXdeDeq3i+YrgPlPL8+NO6BfcjTJINHxco5QWxJcns/UAl8+hl7FX4E9SXin/kVCZ9tb9X4adwDuz8EYeZ5PlK+qopwyaLx4vKm9bF5qQNtoEXq/ERsVPUMnuHT2kL4hymd3803Qi+l17s/+bZgUt/CDx5NHHTCELBdUqfPfrJf5q+58r68/Jvfjtw6cX+bjFKEF14qTz/b+jrK1+9cnHgpXI52g5/VlYWk1fEpT94dOml3L2o7+9/tu1J6hUeqtGFazEkpP41f9NIWcuG1ShcNadOC0YOOd4rVatGEzeNJ8E4xDmAcZJR5EK+2HZKR8KD5yvPV4c4ZJ3aNTjPh59W2PV7d8G9SuKB+3uVOJJrjt2h+6U4Xmkt+qd//2j5R9N48qj4/if6Xlm+PJC4XzHUQqSwlehx+Y0ffxT9T/9zz24Loh75WabfGx/4/vvbF14q0/Nn+36/X7yM4s+3P/58O4rKV69cvHev7+Nfbk8f6n6Z1l/dumM8KZHN5RcNEYZHRP6maawa2m29JJm40DHq7NzrU8L/AMjmXMdRK5gcEZyX9KZeuCGUVZweOzWptBZZqwquA0ASrMXujuFF15s1rpA6tmCBwqyAPW69MzOa82S8fMkaKRWnbynl0h3TRSzJpjjZq/i1XHRE/uEo2qsodQI1T/1xexWGco5V/g15fpzH0saBXdKb2loVl6Khzoe6uGjY00KticDcp53DANCrBoMnU29PTolbdwyyucKsYF67tG421g2yOU/K4IPOHM//AJ6UPD9JsArDI6IwK3jfC7PicAheuhPLKScyZkZzkhBqzYtlLRKXLswKZVW7iM00zslaFc+7Grljgq1DNheuGimPkKl02RDBAlx3nMgozAql4skQYeGGiCM5m5Mk2YMOM6m4aCRJZHOltai4aOpvqEbKwh07YqJMnK1N30Ctdah1qHV3YJjNESFcNWxe45pOTokWmbDFJGXB27J0x8T+BsxcRrhqJHWkJNq0GolVscDG1uqy6Wqj5DjiqR+cAEd1KppnEuwGb0U1mpwSuzu1XcrmbAdblDCX1BTIAVaYFdQ9cjhDDgilu2nWSiytm7YmbawbojhsNtZNUnjGy9DBFpXuwlpFhJnLLc4DSOp6f+o+NiI20qY+PCJS/TxTX2ACAHcsdjlrgWyOaWjn49RpEa6aYqjzoS6tRRw53lUAePBQcLz1AH3W1hhJNYpjkrUnm+J7mQTr5DhKa1G4akp3oRSGR0Rj3Hf6+MugQVhAEmYuo7howlDbrZiF6LLpzSqq+V5xMRY2GNyJ0LqBGfYZkHSGHF6PjXUjJXZ3TOdex0tIkPmbxm4hZpXZnLLwAmUthkcEVx+9ifrDI2Jj3ehNDaDgOq7jJIpNq+9l4kCqzYyln1OnhTsmEnbXidK/tG6UVUGg4qkndhIKs2J3x2ysG7sCnlbXvncZFnCGHCKEWif0b3hE2NRYSsCXt7UY6t0dw1jXCUbpslEWQaBg4ftyZjSnFKiG15zr3DEhxwGC947iSOiWnlONACTGoBqdO2NaoTzDCSWJHGuhrGpKoEcmWUnwPfnhP88VXCcf6iaoTeD41GlhLZTqZa+ScFIWFthYN+Gq4fI5qX9rJlUjy+hRjQqzYqHgLN+YO3VadP5UfhLjZL6oYUEEZ0zYLVhenWpUXDSoRjOjOU9KC9itrvfp1GnBnJUQkz328NbIyMbpoqbZg+KXPngoiEwn0XzujLmlFD9ISlgLOV6HAT9QgQIBxUUzPBJzahpEk+rfyVM2kmifFbpsnPMNCNFQxGXsVmwogy9z+K7W78FDAZJE8eewD3O9KKX0PUmEySkB4NZ788MjwlqVnNN0QSPO1wGzuGjsFhIW2gR62aQcYGdIitZQ6zp2HQVHuztQNfJPZHAG2Ko9iSApXibPkwCsgiXosulFSKpGAAKlJElewlYcf+Z54T1PmBYkBge+fnz2J7/4pHyvLATdK5ef+c7ZjkS5TL8gmhb0zbMDP/6XjyavTH/22Ta9DPNrKKUsaHocb74qvnl89vHe9n98sf08UQXAf6MvKlPnwsuTR/rz7b7c9k5V/NWf9Is/wpuvCmT675XLysIbrws+GViVfGp8fNKrHjJzGe9en9vdMUGg6vipFAP97o4JFCRhueD4VxlaoTsvNxoCT63AbsVFR6srZWxDvcQiYJ3jde8SM5fhB4pd39bA1zkvgg/g+cqrqZnOkLNQcIZHhLLIL5quVjA5trI2PRlkG0nH7o4JVw2fVTLIHICSowYvGyxISgDWKlC9kiNqLlJmRnMYdYqhvnBtPujsfPbBQ+GOAWO1fatGGqbtLnEmPnVaoDddMZujQfiBshaSuNZA4sZEsAqppTXXCN5rqtgxq8gvmvyiKa1FyOZadYEMNWIxsLFuAtWjVOAMOb4nfV9aNGQCi3DVuGMClK7w8Sm6BXxfTeT1kSmeq+y4iKpGhxXqXPpa1E/texiu48hxLMyKyZFYRaaa70mZLvtSotHiABc7nEnMjOaYIrFzpe9SqHUQKOKQqEY9y9r1oKoxF2VRWoten0qXyhcKzoc/nJNSAvDkERF17oyhQSytG6awM6MpjpclkrbGHl6/PtdMC4Z6cT/nfBSuGgIsAYBSylos3xDhajoPmhnNzYw6oTyU+FejhEOoFVNcNIzMTZyVTarjdVIhliA6pA7toMJ1HHdM8LnTxroJAlWaEsxxZ0bbOm1HhcxKzLmKi4a5Dh3MWnWTnCHHGULjEdjuTncgnmoYLxCgeL0Ks8fVK6kW9sV1pObPLLPVegnQQD1hj2VR4+lOnYz1CjxcwjhDjt3S+aJOKrFW8TDrnBeAYRcf5n5GgJudFLouAdroe4qkPHVaEJnjL5DrODSo630VFg2QySCezVENo2ZGc8jm+KW9STltRVOJ3R3TocSZOmKlMdEr2Z5qlK49pOos8eFK+QTWlUjGzn2MDbdIEX15ek042d4k/v3Wce1JxJPjbFFsU8uK8PSaUlmGk3G6SYPd8/GDoxhqz1et1UG3Q2udmqZTVfhMrMRSihIbW3+Ms+SYE6WeaHQzVIOG1fT7VpaVSVSyjTaSQ+qpQefDk5I18eNhZsvpAa+1BY23oa3twkmOtzX16Iqwtr1qBdai6/OyhmjkU5WUtaaUTphsMnVPKVSbObgz5KgV3Xl2SloMlVW8RlJKa2GtshY+KSIpCcPdNPQrhdR9Xlo3qdw+m0ydjxBbiRZRnU0dtpahDixgFZGUEhJSKViruFS5kFe16poP9dQtgpTyyIYjjvCUJFmNrFLeD+RhhbokBAqtM3cdJ28P26hQ6yAACJ6EOzaXvMx1ADioRvmibvVqZaECRQGkh4XZthUaH6O0/jVcNXza0vqWhk6vatSsAVQj7pDmBU7ZqGqUv2msVV5DA1Yx1I2tArbmgYcDY2oLF/f6c+N5018nijoRZ9ruEp+8qxU4Q/VrIUnbcN4avakbV0Vvav8dEGH59lzSePv2e/M9pDJr4fnKes2rFm8RS/tWW4vJKTEzmqu1nBTSZcXGHyanRFA7eucoT6qmyRHRqPqW1iLvNSUlFgox3Qq1/t5b850V2unDDxRT7OQR1sJ1HGRzkyNieER4ErvrBkCQtJykjQPNa5de7P/4Xl+5XJbfvShfHvjmubNLd8zjvW39+fali9v2K5SjsiDSm/qNNz6yACq2b6CP628xOHBhqF8IwvNkrWV3mhZSSHq+9psjh1G2HPVxb9rf/OMnc1dBvzcQ/vKTZ75zdnfHVAD3TwWePPr++x/9640D7ZxtYqm2Nm+/N39/oZDQM24pKt3FzGXkb5rJKdHkXVJKT8YSB5ePseKRwHQ1StrfOLTsoVzO9+MdKLhOaS3icksSGB7zRQ3CIW3WKY2gyXv0prYrcF2Hg354RJw7Y7x32oZ7AiTcJH+IhBCuGqUQKHUI51i4ITh5hFont1B4xQ/XMVNaDL2rUEoxGJwaEXpTF0NNFAsXfnsnZlGX0nTqAzVLNuc6zkLB8b30j5IERjmWllzHodpacPvj4akskyrxeFL6H8TaTSJfKAW1AtdtOxUe7/5w7rAet4M6a+pWL9+e02VjLZYLzsa6KYaaG4hCreuNW12ZBKAwK6xVfHBdcB2+5OZdje9ZFFzH82S7gEjhl4cK9k323L89x7SQg7ngOjGLr0Z+oN69Pnckjcq0c493r8/5gWI5lwh8qy0MNR+0LLiO78tj9nw2xSQR4hlnc0SQ4zHZZRyfuGkkyU72v+2VrJnR3IYnvXfU/QWHQS/UWgGelMkNKiLUK7wGgtxOqWvCiUZ4kFIyG8wX42ovUPBqYmUx1Naq5YVCJyt12JUsKejje31al6cl4cmj3/zX2Vcvbv/0K1S+wvCI+MkvPnnhnHjjL/vtr62t1N/12Re/Ovo2VTWauGZMbZt8Ty78tQCAJ4++ee7sZ2vbr1wRz+1tv3BO/NnLF0Ot53+q7t+ea5eIjgbxpjGRL0opCzUMvXXHLN8QAPI3jSScGhHcKxQEB5pAJcnl223J6ERR8zm7JPn69dp1oVAHFq9PxQcohQbU7qiJPxmddNjXr9twY/1e7aYH/ye5qhMo8nxIH9IH+c19wntxr7/0FUlfNvQz+4Hi257SV3w1hd/I7ftBl9c4O7plpje1947yGvaKRbn8olmYFaxTx4yzGoWrXALCKgWKyZhFvdmWajyAX+yOCT5TnZwS8eZUI+5Hffutec+TBfekb5nVrXpNSVm/xpZc4+NOjcbrbXpTc9FWultHas6/TJpiNXcFScPW8IhYumOYaMf+1pM96O72czWauDYPiqEpoXNM/hPSxdlMjoPb8Jru/GmtA4XJKXHujGEVLnlNjNdAGGqf7+32dA8109VJxPJCgYAL1+b5nNR1HD50oYMSIjWqHDXmurFumK0RYXfdOOdFY/GS8ON8UftKvXt9rud7tZlu38Dc7O335vPFmuKTzdVJCvfgDR4gsolhquZmtuGksODWK64L1+YB3L/dKaU6GZN4Oe/fnrPAhWvzxbBZlqDaSXYrOYivaNa6kQuuk9z2nChqP1C+J5OasudxrG8S4ONdi9oXUzQtbfVgH2m1pa20GoWLJlCwqMPp8ccJfIVF8gUHBCnl0RpdaS3a5a/tsIoAKWVh9iS/yKLvpL47hb9PQKk6lSXE383RSFIt6ir58LfzjSN9J/91MNWIk6+ycdekjW2QRPi2vzjl2zHp/3pk8Ds3npr01KSnJj016alJT016atK3Ov4XAl3W38ZIj2gAAAAASUVORK5CYII=';

    // Márgenes de página: Superior 1 cm, Inferior 1 cm, Izquierdo
    // 1.27 cm, Derecho 1.75 cm (1 cm = 567 twips, 1.27 cm = 720 twips,
    // 1.75 cm = 992 twips).
    const PAGINA = {
        size: { width: 11907, height: 16840 }, // A4
        margin: { top: 567, bottom: 567, left: 720, right: 992 }
    };

    // Ancho útil de la página (sin márgenes), en twips — se usa como
    // posición del tope de tabulación derecho para los campos que van
    // "pegados" al margen derecho (Cargo, ID), de forma que su línea
    // punteada se estire dinámicamente hasta el límite del margen sin
    // importar el largo del dato.
    const ANCHO_UTIL = PAGINA.size.width - PAGINA.margin.left - PAGINA.margin.right;

    const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
        'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    function fechaPartes(fechaISO) {
        if (!fechaISO) return { dia: '', mes: '', anio: '' };
        const partes = String(fechaISO).slice(0, 10).split('-');
        if (partes.length !== 3) return { dia: '', mes: '', anio: '' };
        const [y, m, d] = partes;
        return { dia: String(parseInt(d, 10)), mes: MESES[parseInt(m, 10) - 1] || '', anio: y };
    }

    // ---- La pieza clave: en vez de "dibujar" la línea con caracteres
    // de punto, se usa el SUBRAYADO PUNTEADO real de Word aplicado a
    // todo el run (espacios de relleno + el dato en medio). Como el
    // subrayado es una línea continua que Word dibuja bajo el texto
    // completo del run, queda perfectamente continua tanto bajo los
    // espacios en blanco como bajo las letras del dato — igual que
    // en la boleta impresa. Si el campo está vacío, el run entero son
    // espacios subrayados (línea punteada completa, sin datos).
    function dato(cantidadEspacios, valor) {
        const d = window.docx;
        const v = String(valor || '').trim();
        let texto;
        if (!v) {
            texto = ' '.repeat(cantidadEspacios);
        } else {
            const disponibles = cantidadEspacios - v.length - 2; // 2 espacios separadores (antes y después del dato)
            const despues = disponibles < (MIN_ESPACIOS_ANTES_DATO + MIN_ESPACIOS_TRAS_DATO)
                ? MIN_ESPACIOS_TRAS_DATO
                : disponibles - MIN_ESPACIOS_ANTES_DATO;
            texto = ' '.repeat(MIN_ESPACIOS_ANTES_DATO) + v + ' '.repeat(despues);
        }
        return new d.TextRun({
            text: texto,
            font: FUENTE,
            size: TAM_TEXTO,
            underline: { type: d.UnderlineType.DOTTED }
        });
    }

    // Línea final alineada: NO se usan espacios subrayados ni se
    // intenta calcular la cantidad de puntos. El valor termina en un
    // tabulador con líder de puntos cuyo TOPE es una única coordenada
    // fija para todos los campos.
    //
    // OJO: se usa RIGHT y NO LEFT. Se probó con LEFT (como decía este
    // comentario antes) y se comprobó que tanto Word como LibreOffice
    // cortan la línea ahí mismo: si la posición del dato ya "pasó" el
    // tope de un tabulador LEFT sin texto después, el motor de
    // renderizado empuja el tabulador entero a una línea nueva y el
    // líder de puntos termina dibujándose solo, ocupando el ancho
    // COMPLETO de esa línea nueva (desde el margen izquierdo) en vez
    // de pegado al dato. Con RIGHT el comportamiento es el correcto:
    // el líder se dibuja en la MISMA línea, inmediatamente después
    // del dato, hasta el margen — confirmado generando el .docx real
    // y revisando el PDF resultante.
    function datoHastaMargen(valor) {
        const d = window.docx;
        const v = String(valor || '').trim();
        // Igual que en dato(): 8 espacios de separación ANTES del dato,
        // y el mismo subrayado punteado real de Word debajo del dato.
        // Después del dato, el tabulador NO lleva "líder de puntos"
        // (leader) — lleva el MISMO subrayado punteado aplicado como
        // formato de carácter al propio tabulador. Se probó con
        // leader:DOT y, aunque queda en la misma línea (ya no se corta),
        // los puntos del leader quedan a una altura ligeramente distinta
        // de los puntos del subrayado (dos estilos de "punto" distintos
        // de Word), y se nota el salto justo donde termina el dato.
        // Subrayando el tabulador en vez de usar leader, todo el tramo
        // -antes, dato y después- queda con el MISMO subrayado punteado,
        // a la misma altura, como una sola línea continua hasta el
        // margen.
        const texto = ' '.repeat(MIN_ESPACIOS_ANTES_DATO) + v;
        return [
            new d.TextRun({
                text: texto,
                font: FUENTE,
                size: TAM_TEXTO,
                underline: { type: d.UnderlineType.DOTTED }
            }),
            new d.TextRun({ text: '\t', underline: { type: d.UnderlineType.DOTTED } })
        ];
    }

    function margenTabStop() {
        const d = window.docx;
        return [{ type: d.TabStopType.RIGHT, position: ANCHO_UTIL }];
    }

    // "Sin borde": en vez de BorderStyle.NONE (que algunos motores de
    // renderizado no respetan y terminan dibujando una línea fina de
    // todos modos), se usa un borde real pero del mismo color blanco
    // de la hoja — así, si el visor llegara a dibujarlo, queda
    // invisible sobre el fondo en vez de aparecer como una línea
    // punteada/continua cruzando la página.
    const SIN_BORDE = { style: 'single', size: 2, color: 'FFFFFF' };
    const BORDES_CELDA_INVISIBLES = { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE };
    function bordesTablaInvisibles() {
        return { top: SIN_BORDE, bottom: SIN_BORDE, left: SIN_BORDE, right: SIN_BORDE, insideHorizontal: SIN_BORDE, insideVertical: SIN_BORDE };
    }

    // Bloque de las dos firmas lado a lado (Trabajador / Jefe que
    // autoriza). Se arma como tabla de 2 columnas SIN bordes (mismo
    // truco que encabezado()) en vez de tabuladores sueltos, para que
    // cada firma tenga SU PROPIA línea de puntos suspensivos exacta
    // encima de su etiqueta, sin depender de que los tabs "salten"
    // a la posición correcta.
    function bloqueFirmas() {
        const d = window.docx;
        const anchoUtil = ANCHO_UTIL;
        const anchoColumna = Math.floor(anchoUtil / 2);

        const columnaFirma = (etiqueta, ancho) => new d.TableCell({
            width: { size: ancho, type: d.WidthType.DXA },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            borders: BORDES_CELDA_INVISIBLES,
            children: [
                parrafo([run('………………………………………')], { alignment: d.AlignmentType.CENTER, line: 240 }),
                parrafo([run(etiqueta)], { alignment: d.AlignmentType.CENTER, line: 240, before: 40 })
            ]
        });

        return new d.Table({
            width: { size: anchoUtil, type: d.WidthType.DXA },
            borders: bordesTablaInvisibles(),
            rows: [new d.TableRow({
                children: [
                    columnaFirma('Firma del Trabajador', anchoColumna),
                    columnaFirma('Firma y sello del Jefe que autoriza', anchoUtil - anchoColumna)
                ]
            })]
        });
    }

    // Interlineado igual al original de la plantilla (line: 360 ≈ 1.5
    // líneas) — NO se comprime; el ajuste para que ambas copias
    // quepan en una sola hoja A4 sin dejar espacio vacío al final se
    // logra con los márgenes (ver PAGINA), no achicando el interlineado.
    const LINEA_NORMAL = 360;
    const ESPACIO_VACIO = 60;

    function run(text, opts = {}) {
        const d = window.docx;
        return new d.TextRun({
            text: String(text ?? ''),
            font: FUENTE,
            size: opts.size ?? TAM_TEXTO,
            bold: !!opts.bold,
            underline: opts.underline ? {} : undefined
        });
    }

    function parrafo(children, opts = {}) {
        const d = window.docx;
        return new d.Paragraph({
            alignment: opts.alignment || d.AlignmentType.JUSTIFIED,
            spacing: { before: opts.before || 0, after: opts.after ?? 0, line: opts.line || LINEA_NORMAL, lineRule: d.LineRuleType.AUTO },
            tabStops: opts.tabStops,
            border: opts.border,
            children
        });
    }

    function vacio() { return parrafo([run('')], { after: ESPACIO_VACIO }); }

    // Encabezado con el logo a la izquierda y las 3 líneas de título
    // centradas en el resto del ancho de página — igual que la
    // boleta impresa. Se arma como tabla de 2 columnas SIN bordes
    // (truco estándar para "flotar" una imagen junto a texto
    // centrado en Word) para no depender de posicionamiento flotante.
    function encabezado() {
        const d = window.docx;
        const anchoUtil = PAGINA.size.width - PAGINA.margin.left - PAGINA.margin.right; // twips
        const anchoLogo = 720; // 0.5"

        const celdaLogo = new d.TableCell({
            width: { size: anchoLogo, type: d.WidthType.DXA },
            verticalAlign: d.VerticalAlign.CENTER,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            borders: BORDES_CELDA_INVISIBLES,
            children: [parrafo([
                new d.ImageRun({
                    type: 'png',
                    data: Uint8Array.from(atob(LOGO_BASE64), c => c.charCodeAt(0)),
                    // Logo aumentado 10% adicional (52.8x73.7 → 58.1x81.1);
                    // no importa si con el nuevo tamaño queda ligeramente
                    // desalineado respecto al título de al lado.
                    transformation: { width: 58.1, height: 81.1 }
                })
            ], { alignment: d.AlignmentType.CENTER, line: 240 })]
        });

        const celdaTitulo = new d.TableCell({
            width: { size: anchoUtil - anchoLogo, type: d.WidthType.DXA },
            verticalAlign: d.VerticalAlign.CENTER,
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            borders: BORDES_CELDA_INVISIBLES,
            children: [
                parrafo([run('UNIVERSIDAD PRIVADA “ANTENOR ORREGO”', { bold: true, size: TAM_TITULO })], { alignment: d.AlignmentType.CENTER, line: 240 }),
                parrafo([run('Dirección de Recursos Humanos', { bold: true, size: TAM_TITULO })], { alignment: d.AlignmentType.CENTER, line: 240 }),
                parrafo([run('PAPELETAS DE PERMISO PARA SALIR DEL CENTRO DE TRABAJO', { bold: true, underline: true, size: TAM_TITULO })], { alignment: d.AlignmentType.CENTER, line: 240 })
            ]
        });

        return new d.Table({
            width: { size: anchoUtil, type: d.WidthType.DXA },
            borders: bordesTablaInvisibles(),
            rows: [new d.TableRow({ children: [celdaLogo, celdaTitulo] })]
        });
    }

    // Arma UNA copia completa de la boleta (se llama dos veces:
    // una para el trabajador, una para el file, igual que antes).
    // "lineaFinal": si es true, agrega el borde grueso de separación
    // directamente en el propio párrafo de la NOTA (sin un párrafo
    // aparte, para no gastar una línea extra de alto).
    function construirCopia(registro, fechaPartesObj, lineaFinal) {
        const d = window.docx;

        const funcionario = registro.FUNCIONARIO_EXPIDE || '';
        const cargo = registro.CARGO_FUNCIONARIO || '';
        const trabajador = (registro.EMPLEADO || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
        const idPersonal = registro.ID_PERSONAL || '';
        const dependencia = registro.DEPENDENCIA || '';
        const horaSalida = registro.HORA_SALIDA || '';
        const horaRetorno = registro.HORA_RETORNO || '';
        const duracion = registro.DURACION_TOTAL ? (registro.DURACION_TOTAL + ' h') : '';
        const motivo = registro.MOTIVO_SALIDA || '';
        const lugarDestino = registro.LUGAR_DESTINO || '';
        const otraEspecificar = registro.OTRA_ESPECIFICAR || '';

        // Casilla marcada: se sobrescribe el espacio "(    )" por "( X )"
        // de la clase de permiso que corresponda, dejando las demás igual.
        const marca = (clase) => registro.CLASE_PERMISO === clase ? '( X )' : '(    )';

        return [
            encabezado(),
            vacio(),

            parrafo([
                run('Funcionario que la expide: '), dato(28, funcionario),
                run(' Cargo: '), ...datoHastaMargen(cargo)
            ], { tabStops: margenTabStop(), alignment: d.AlignmentType.LEFT }),
            parrafo([
                run('Trabajador autorizado para salir: '), dato(28, trabajador),
                run(' ID: '), ...datoHastaMargen(idPersonal)
            ], { tabStops: margenTabStop(), alignment: d.AlignmentType.LEFT }),
            parrafo([
                run('Dependencia: '), ...datoHastaMargen(dependencia)
            ], { tabStops: margenTabStop(), alignment: d.AlignmentType.LEFT }),
            parrafo([
                run('Hora de Salida: '), dato(14, horaSalida),
                run('; Hora de Retorno: '), dato(14, horaRetorno),
                run('; Duración Total: '), ...datoHastaMargen(duracion)
            ], { tabStops: margenTabStop(), alignment: d.AlignmentType.LEFT }),
            parrafo([
                run('Motivo de la Salida: '), ...datoHastaMargen(motivo)
            ], { tabStops: margenTabStop(), alignment: d.AlignmentType.LEFT }),
            parrafo([
                run('Clase de Permiso: Personal '), run(marca('Personal')),
                run(', Comisión de Servicio '), run(marca('Comisión de Servicio')),
                run(', Capacitación '), run(marca('Capacitación')),
                run(', Enfermedad '), run(marca('Enfermedad')),
                run(', Lactancia '), run(marca('Lactancia')),
                run(', Otra (especificar): '), ...datoHastaMargen(otraEspecificar)
            ], { tabStops: margenTabStop(), alignment: d.AlignmentType.LEFT }),
            parrafo([
                run('En caso de comisión de servicios, Indicar lugar de destino: '), ...datoHastaMargen(lugarDestino)
            ], { tabStops: margenTabStop(), alignment: d.AlignmentType.LEFT }),
            vacio(),

            parrafo([
                run('Trujillo, '), dato(6, fechaPartesObj.dia),
                run(' de '), dato(20, fechaPartesObj.mes),
                run(' del '), run(fechaPartesObj.anio || '')
            ], { alignment: d.AlignmentType.CENTER }),
            vacio(),

            bloqueFirmas(),
            vacio(),

            parrafo([run('………………………………………')], { alignment: d.AlignmentType.CENTER, line: 240 }),
            parrafo([run('\t'), run('Firma de Personal autorizado de')], { tabStops: [{ type: d.TabStopType.LEFT, position: 3402 }], line: 240 }),
            parrafo([run('\tDirección de Recursos Humanos')], { before: 120, tabStops: [{ type: d.TabStopType.LEFT, position: 3402 }] }),

            parrafo([
                run('NOTA: ', { bold: true }),
                run('Llenar con letra clara todo el formulario. Los permisos serán tratados conforme a normas.')
            ], {
                after: 200,
                // Línea gruesa de corte entre las 2 copias: va pegada
                // como borde inferior de este mismo párrafo (NO un
                // párrafo aparte) para no perder una línea extra de
                // espacio — solo se agrega en la primera copia.
                border: lineaFinal
                    ? { bottom: { style: 'single', size: 6, color: '000000', space: 4 } }
                    : undefined
            })
        ];
    }

    function construirDocumento(registro) {
        const fp = fechaPartes(registro.FECHA_PERMISO);
        const copia1 = construirCopia(registro, fp, true);
        const copia2 = construirCopia(registro, fp, false);

        return new window.docx.Document({
            sections: [{
                properties: { page: PAGINA },
                children: [...copia1, ...copia2]
            }]
        });
    }

    async function generar(registro) {
        if (!registro || !registro.ID_PERMISO) {
            window.toast('⚠️ No se encontró la boleta a exportar', 'warning');
            return false;
        }
        if (typeof window.docx === 'undefined') {
            window.toast('⚠️ No se pudo cargar la librería de Word (docx). Revisa tu conexión.', 'warning');
            return false;
        }

        try {
            const doc = construirDocumento(registro);
            const blob = await window.docx.Packer.toBlob(doc);

            const sufijo = (registro.EMPLEADO || 'empleado').replace(/[^\wÀ-ÿ]+/g, '_');
            const nombreArchivo = `Permiso_${registro.ID_PERMISO}_${sufijo}.docx`;

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = nombreArchivo;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            window.toast('📥 Boleta generada (2 copias) — falta la firma física del trabajador, el jefe y RRHH', 'success');
            return true;
        } catch (e) {
            console.error(e);
            window.toast('❌ No se pudo generar el documento Word', 'error');
            return false;
        }
    }

    return { generar };
})();
