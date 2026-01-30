import { useState, useRef, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';
import { Upload, Plus, Trash2, ChevronLeft, ChevronRight, Download, Check, Search, ArrowUpDown, FileSpreadsheet, Bold, Italic, Type, X, Database, FileText, Underline, AlignLeft, AlignCenter, AlignRight, Wrench } from 'lucide-react';
import Swal from 'sweetalert2';
import toast, { Toaster } from 'react-hot-toast';

// Configurar worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
} from '@tanstack/react-table';

function GeneradorCertificados() {
  // Estados para los diferentes pasos
  const [step, setStep] = useState(1);
  const [backgroundImage, setBackgroundImage] = useState(null);
  const [backgroundImages, setBackgroundImages] = useState([]); // Para múltiples páginas (anverso/reverso)
  const [currentPageIndex, setCurrentPageIndex] = useState(0); // 0 = anverso, 1 = reverso
  const [canvasWidth, setCanvasWidth] = useState(2000);
  const [canvasHeight, setCanvasHeight] = useState(1414);
  const [excelData, setExcelData] = useState([]);
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [fields, setFields] = useState([]);
  const [fieldsPage2, setFieldsPage2] = useState([]); // Campos para el reverso
  const [selectedFieldId, setSelectedFieldId] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [draggedField, setDraggedField] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState([]);
  const [showAddFieldModal, setShowAddFieldModal] = useState(false);
  const [newFieldType, setNewFieldType] = useState('data'); // 'data' o 'static'
  const [newFieldColumnIndex, setNewFieldColumnIndex] = useState(0);
  const [newFieldStaticText, setNewFieldStaticText] = useState('');
  const [newFieldAlignment, setNewFieldAlignment] = useState('left'); // 'left' o 'center'

  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const excelInputRef = useRef(null);
  const backgroundImageRef = useRef(null);

  // Función para convertir todas las páginas de un PDF a imágenes
  const convertPdfToImages = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    const pages = [];

    // Limitar a máximo 2 páginas (anverso y reverso)
    const maxPages = Math.min(numPages, 2);

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);

      // Calcular escala para obtener 2000px de ancho
      const originalViewport = page.getViewport({ scale: 1 });
      const targetWidth = 2000;
      const scale = targetWidth / originalViewport.width;
      const viewport = page.getViewport({ scale });

      // Crear canvas para renderizar
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');

      // Fondo blanco (los PDFs pueden tener transparencia)
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Renderizar la página del PDF al canvas
      await page.render({
        canvasContext: ctx,
        viewport: viewport,
      }).promise;

      // Convertir a base64 PNG
      const imageData = canvas.toDataURL('image/png');

      pages.push({
        imageData,
        width: canvas.width,
        height: canvas.height,
        pageNumber: i,
      });
    }

    return {
      pages,
      totalPages: numPages,
    };
  };

  // PASO 1: Manejar carga de imagen de fondo (soporta imágenes y PDF)
  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (isPdf) {
      // Procesar archivo PDF
      try {
        toast.loading('Procesando PDF...', { id: 'pdf-loading' });

        const result = await convertPdfToImages(file);

        // Usar la primera página como imagen principal
        const firstPage = result.pages[0];
        setCanvasWidth(firstPage.width);
        setCanvasHeight(firstPage.height);
        setBackgroundImage(firstPage.imageData);
        setBackgroundImages(result.pages);
        setCurrentPageIndex(0);

        toast.dismiss('pdf-loading');

        if (result.pages.length > 1) {
          toast.success(`✓ PDF cargado: ${result.pages.length} páginas (anverso y reverso)`);
        } else if (result.totalPages > 2) {
          toast.success(`✓ PDF cargado: ${firstPage.width}x${firstPage.height}px (solo se usarán las primeras 2 páginas)`);
        } else {
          toast.success(`✓ PDF cargado: ${firstPage.width}x${firstPage.height}px`);
        }
      } catch (error) {
        toast.dismiss('pdf-loading');
        console.error('Error al procesar PDF:', error);
        Swal.fire({
          title: 'Error al procesar PDF',
          text: 'No se pudo convertir el PDF a imagen. Asegúrate de que el archivo sea un PDF válido.',
          icon: 'error',
          confirmButtonColor: '#9333ea',
          confirmButtonText: 'Entendido'
        });
      }
    } else {
      // Procesar archivo de imagen (solo una página)
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const originalWidth = img.width;
          const originalHeight = img.height;

          setCanvasWidth(originalWidth);
          setCanvasHeight(originalHeight);

          const canvas = document.createElement('canvas');
          canvas.width = originalWidth;
          canvas.height = originalHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, originalWidth, originalHeight);

          const imageData = canvas.toDataURL('image/png');
          setBackgroundImage(imageData);
          setBackgroundImages([{ imageData, width: originalWidth, height: originalHeight, pageNumber: 1 }]);
          setCurrentPageIndex(0);

          toast.success(`✓ Imagen cargada: ${originalWidth}x${originalHeight}px`);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  // PASO 2: Manejar carga de Excel
  const handleExcelUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

        if (jsonData.length === 0) {
          Swal.fire({
            title: 'Archivo vacío',
            text: 'El archivo Excel no contiene datos',
            icon: 'error',
            confirmButtonColor: '#9333ea',
            confirmButtonText: 'Entendido'
          });
          return;
        }

        const headers = jsonData[0];
        const rows = jsonData.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ''));

        // Validar formato según normativa UNAMAD
        const requiredColumns = ['numero_secuencial', 'numero_documento', 'nombre_completo', 'cargo'];
        const headersTrimmed = headers.slice(0, 4).map(h => String(h).trim().toLowerCase());

        const isValidFormat = requiredColumns.every((col, idx) =>
          headersTrimmed[idx] === col
        );

        if (!isValidFormat) {
          Swal.fire({
            title: 'Formato incorrecto',
            html: `
              <div style="text-align: left;">
                <p style="margin-bottom: 12px;">El archivo no cumple con la normativa de certificados de la <strong>Universidad Nacional Amazónica de Madre de Dios</strong>.</p>
                <p style="margin-bottom: 8px; font-weight: 600;">Las primeras 4 columnas deben ser:</p>
                <ol style="margin-left: 20px; margin-bottom: 12px;">
                  <li><strong>numero_secuencial</strong></li>
                  <li><strong>numero_documento</strong></li>
                  <li><strong>nombre_completo</strong></li>
                  <li><strong>cargo</strong></li>
                </ol>
                <p style="margin-top: 12px; color: #6b7280;">Puedes agregar más columnas después de estas 4.</p>
              </div>
            `,
            icon: 'error',
            confirmButtonColor: '#9333ea',
            confirmButtonText: 'Entendido',
            width: '600px'
          });

          // Limpiar el input
          if (excelInputRef.current) {
            excelInputRef.current.value = '';
          }
          return;
        }

        setExcelHeaders(headers);
        setExcelData(rows);

        // Toast de éxito
        toast.success(`✓ ${rows.length} participantes cargados correctamente`);
      } catch (error) {
        Swal.fire({
          title: 'Error al leer Excel',
          text: error.message,
          icon: 'error',
          confirmButtonColor: '#9333ea',
          confirmButtonText: 'Entendido'
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Lista de fuentes disponibles
  const availableFonts = [
    { name: 'Arial', value: 'Arial' },
    { name: 'Roboto', value: 'Roboto' },
    { name: 'Open Sans', value: 'Open Sans' },
    { name: 'Montserrat', value: 'Montserrat' },
    { name: 'Lato', value: 'Lato' },
    { name: 'Poppins', value: 'Poppins' },
    { name: 'Playfair Display', value: 'Playfair Display' },
    { name: 'Merriweather', value: 'Merriweather' },
    { name: 'Oswald', value: 'Oswald' },
    { name: 'Raleway', value: 'Raleway' },
    { name: 'Ubuntu', value: 'Ubuntu' },
    { name: 'Nunito', value: 'Nunito' },
    { name: 'Dancing Script', value: 'Dancing Script' },
    { name: 'Pacifico', value: 'Pacifico' },
    { name: 'Great Vibes', value: 'Great Vibes' },
    { name: 'Cinzel', value: 'Cinzel' },
  ];

  // Helpers para obtener campos de la página actual
  const getCurrentFields = () => currentPageIndex === 0 ? fields : fieldsPage2;
  const setCurrentFields = (newFields) => {
    if (currentPageIndex === 0) {
      setFields(newFields);
    } else {
      setFieldsPage2(newFields);
    }
  };

  // PASO 3: Agregar nuevo campo (desde el modal)
  const addFieldFromModal = () => {
    const currentFields = getCurrentFields();
    const newField = {
      id: Date.now(),
      x: canvasWidth / 2,
      y: canvasHeight / 2,
      columnIndex: newFieldType === 'data' ? newFieldColumnIndex : 0,
      customText: newFieldType === 'static' ? newFieldStaticText : '',
      fontSize: 32,
      color: '#000000',
      fontFamily: 'Arial',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: newFieldAlignment,
      fieldType: newFieldType, // 'data' o 'static'
    };
    setCurrentFields([...currentFields, newField]);
    setSelectedFieldId(newField.id);

    // Cerrar modal y resetear
    setShowAddFieldModal(false);
    setNewFieldType('data');
    setNewFieldColumnIndex(0);
    setNewFieldStaticText('');
    setNewFieldAlignment('left');

    toast.success(`Campo agregado al ${currentPageIndex === 0 ? 'anverso' : 'reverso'}`);
  };

  // Eliminar campo
  const deleteField = (id) => {
    const currentFields = getCurrentFields();
    setCurrentFields(currentFields.filter(f => f.id !== id));
    if (selectedFieldId === id) {
      setSelectedFieldId(null);
    }
    toast.error('Campo eliminado');
  };

  // Actualizar campo
  const updateField = (id, updates) => {
    const currentFields = getCurrentFields();
    setCurrentFields(currentFields.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  // Manejo de drag & drop
  const handleCanvasMouseDown = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasWidth / rect.width;
    const scaleY = canvasHeight / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    const currentFields = getCurrentFields();

    // Buscar si se hizo clic en algún campo (en orden inverso para respetar el z-index)
    for (let i = currentFields.length - 1; i >= 0; i--) {
      const field = currentFields[i];
      const text = field.customText || (excelData[0] ? excelData[0][field.columnIndex] : 'Campo');
      const ctx = canvas.getContext('2d');
      const fontStyle = field.fontStyle || 'normal';
      const fontWeight = field.fontWeight || 'normal';
      ctx.font = `${fontStyle} ${fontWeight} ${field.fontSize}px ${field.fontFamily || 'Arial'}`;
      const metrics = ctx.measureText(text);
      const textWidth = metrics.width;
      const textHeight = field.fontSize;

      // Calcular posición según alineación
      let textX = field.x;
      const textAlign = field.textAlign || 'left';
      if (textAlign === 'center') {
        textX = field.x - textWidth / 2;
      } else if (textAlign === 'right') {
        textX = field.x - textWidth;
      }

      if (
        mouseX >= textX &&
        mouseX <= textX + textWidth &&
        mouseY >= field.y - textHeight &&
        mouseY <= field.y
      ) {
        setSelectedFieldId(field.id);
        setDraggedField(field.id);
        setDragOffset({
          x: mouseX - field.x,
          y: mouseY - field.y,
        });
        return;
      }
    }

    // Si no se hizo clic en ningún campo, deseleccionar
    setSelectedFieldId(null);
  };

  const handleCanvasMouseMove = (e) => {
    if (!draggedField) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasWidth / rect.width;
    const scaleY = canvasHeight / rect.height;
    const mouseX = (e.clientX - rect.left) * scaleX;
    const mouseY = (e.clientY - rect.top) * scaleY;

    updateField(draggedField, {
      x: mouseX - dragOffset.x,
      y: mouseY - dragOffset.y,
    });
  };

  const handleCanvasMouseUp = () => {
    setDraggedField(null);
  };

  // Estado para forzar re-render después de cargar imagen
  const [imageLoaded, setImageLoaded] = useState(0);

  // Cargar y cachear la imagen de fondo (solo para fase 3+)
  useEffect(() => {
    if (backgroundImage && step >= 3) {
      const img = new Image();
      img.onload = () => {
        backgroundImageRef.current = img;
        // Forzar re-render del canvas después de cargar la imagen
        setImageLoaded(prev => prev + 1);
      };
      img.src = backgroundImage;
    } else if (!backgroundImage) {
      backgroundImageRef.current = null;
    }
  }, [backgroundImage, step]);

  // Renderizar canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !backgroundImage) return;

    const ctx = canvas.getContext('2d');

    // Obtener campos de la página actual
    const currentFields = currentPageIndex === 0 ? fields : fieldsPage2;

    // Para fase 3+, usar imagen cacheada para evitar parpadeo
    if (step >= 3 && backgroundImageRef.current) {
      const render = () => {
        // Limpiar canvas
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Agregar fondo blanco para PNG con transparencia
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        // Dibujar imagen de fondo cacheada
        ctx.drawImage(backgroundImageRef.current, 0, 0, canvasWidth, canvasHeight);

        // Dibujar campos
        currentFields.forEach(field => {
          let text = '';

          if (step === 3) {
            // En paso 3, usar datos de la primera fila o texto personalizado
            text = field.customText || (excelData[0] ? excelData[0][field.columnIndex] : 'Campo');
          } else if (step === 4 || step === 5) {
            // En pasos 4 y 5, usar datos del índice de preview
            text = field.customText || (excelData[previewIndex] ? excelData[previewIndex][field.columnIndex] : '');
          }

          const fontStyle = field.fontStyle || 'normal';
          const fontWeight = field.fontWeight || 'normal';
          ctx.font = `${fontStyle} ${fontWeight} ${field.fontSize}px ${field.fontFamily || 'Arial'}`;
          ctx.fillStyle = field.color;

          // Calcular posición según alineación
          const metrics = ctx.measureText(text);
          let textX = field.x;
          const textAlign = field.textAlign || 'left';

          if (textAlign === 'center') {
            textX = field.x - metrics.width / 2;
          } else if (textAlign === 'right') {
            textX = field.x - metrics.width;
          }

          ctx.fillText(text, textX, field.y);

          // Dibujar subrayado si está activado
          if (field.textDecoration === 'underline') {
            const underlineY = field.y + field.fontSize * 0.1;
            ctx.beginPath();
            ctx.strokeStyle = field.color;
            ctx.lineWidth = Math.max(1, field.fontSize * 0.05);
            ctx.moveTo(textX, underlineY);
            ctx.lineTo(textX + metrics.width, underlineY);
            ctx.stroke();
          }

          // Si está seleccionado, dibujar borde
          if (field.id === selectedFieldId && step === 3) {
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.strokeRect(textX - 2, field.y - field.fontSize - 2, metrics.width + 4, field.fontSize + 4);
          }
        });
      };

      requestAnimationFrame(render);
    } else {
      // Para fase 1 y 2, renderizar directamente sin cache
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        // Agregar fondo blanco para PNG con transparencia
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      };
      img.src = backgroundImage;
    }
  }, [fields, fieldsPage2, currentPageIndex, selectedFieldId, step, excelData, previewIndex, backgroundImage, canvasWidth, canvasHeight, imageLoaded]);

  // Función helper para dibujar campos en un canvas
  const drawFieldsOnCanvas = (ctx, fieldsToRender, rowData, canvasW, canvasH) => {
    fieldsToRender.forEach(field => {
      const text = field.customText || rowData[field.columnIndex] || '';
      const fontStyle = field.fontStyle || 'normal';
      const fontWeight = field.fontWeight || 'normal';
      ctx.font = `${fontStyle} ${fontWeight} ${field.fontSize}px ${field.fontFamily || 'Arial'}`;
      ctx.fillStyle = field.color;

      // Calcular posición según alineación
      const metrics = ctx.measureText(text);
      let textX = field.x;
      const textAlign = field.textAlign || 'left';

      if (textAlign === 'center') {
        textX = field.x - metrics.width / 2;
      } else if (textAlign === 'right') {
        textX = field.x - metrics.width;
      }

      ctx.fillText(text, textX, field.y);

      // Dibujar subrayado si está activado
      if (field.textDecoration === 'underline') {
        const underlineY = field.y + field.fontSize * 0.1;
        ctx.beginPath();
        ctx.strokeStyle = field.color;
        ctx.lineWidth = Math.max(1, field.fontSize * 0.05);
        ctx.moveTo(textX, underlineY);
        ctx.lineTo(textX + metrics.width, underlineY);
        ctx.stroke();
      }
    });
  };

  // PASO 5: Generar todos los certificados
  const generateAllCertificates = async () => {
    try {
      setIsGenerating(true);
      setGenerationProgress(0);

      const hasTwoPages = backgroundImages.length > 1;
      console.log('Iniciando generación de', excelData.length, 'certificados', hasTwoPages ? '(con anverso y reverso)' : '');

      const zip = new JSZip();

      // Cargar imágenes de fondo
      const loadImage = (src) => new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.src = src;
      });

      // Cargar primera página (anverso)
      const page1 = backgroundImages[0];
      const img1 = await loadImage(page1.imageData);

      // Cargar segunda página (reverso) si existe
      let img2 = null;
      let page2 = null;
      if (hasTwoPages) {
        page2 = backgroundImages[1];
        img2 = await loadImage(page2.imageData);
      }

      console.log('Imágenes cargadas, comenzando a generar certificados...');

      // Generar cada certificado
      for (let i = 0; i < excelData.length; i++) {
        const rowData = excelData[i];

        // Crear canvas para página 1 (anverso)
        const canvas1 = document.createElement('canvas');
        canvas1.width = page1.width;
        canvas1.height = page1.height;
        const ctx1 = canvas1.getContext('2d');

        // Dibujar página 1
        ctx1.fillStyle = 'white';
        ctx1.fillRect(0, 0, canvas1.width, canvas1.height);
        ctx1.drawImage(img1, 0, 0, canvas1.width, canvas1.height);
        drawFieldsOnCanvas(ctx1, fields, rowData, canvas1.width, canvas1.height);

        const imgData1 = canvas1.toDataURL('image/jpeg', 0.85);

        // Detectar orientación basándose en las dimensiones
        const orientation1 = page1.width > page1.height ? 'landscape' : 'portrait';

        // Crear PDF
        const pdf = new jsPDF({
          orientation: orientation1,
          unit: 'mm',
          format: 'a4'
        });

        const pdfWidth1 = pdf.internal.pageSize.getWidth();
        const pdfHeight1 = pdf.internal.pageSize.getHeight();
        pdf.addImage(imgData1, 'JPEG', 0, 0, pdfWidth1, pdfHeight1);

        // Si hay segunda página (reverso), agregarla
        if (hasTwoPages && img2 && page2) {
          const canvas2 = document.createElement('canvas');
          canvas2.width = page2.width;
          canvas2.height = page2.height;
          const ctx2 = canvas2.getContext('2d');

          // Dibujar página 2
          ctx2.fillStyle = 'white';
          ctx2.fillRect(0, 0, canvas2.width, canvas2.height);
          ctx2.drawImage(img2, 0, 0, canvas2.width, canvas2.height);
          drawFieldsOnCanvas(ctx2, fieldsPage2, rowData, canvas2.width, canvas2.height);

          const imgData2 = canvas2.toDataURL('image/jpeg', 0.85);

          // Agregar segunda página al PDF
          const orientation2 = page2.width > page2.height ? 'landscape' : 'portrait';
          pdf.addPage('a4', orientation2);

          const pdfWidth2 = pdf.internal.pageSize.getWidth();
          const pdfHeight2 = pdf.internal.pageSize.getHeight();
          pdf.addImage(imgData2, 'JPEG', 0, 0, pdfWidth2, pdfHeight2);
        }

        // Convertir PDF a blob
        const pdfBlob = pdf.output('blob');

        // Generar nombre de archivo usando las 4 columnas obligatorias
        const numeroSecuencial = rowData[0] ? String(rowData[0]).trim() : i + 1;
        const numeroDocumento = rowData[1] ? String(rowData[1]).trim() : '';
        const nombreCompleto = rowData[2] ? String(rowData[2]).trim() : '';
        const cargo = rowData[3] ? String(rowData[3]).trim() : '';

        // Limpiar caracteres no válidos para nombres de archivo
        const cleanString = (str) => str.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ');

        const fileName = `${cleanString(numeroSecuencial)}_${cleanString(numeroDocumento)}_${cleanString(nombreCompleto)}_(${cleanString(cargo)}).pdf`;

        // Agregar al ZIP
        zip.file(fileName, pdfBlob);

        // Actualizar progreso
        setGenerationProgress(i + 1);

        console.log(`Certificado ${i + 1}/${excelData.length} generado: ${fileName}${hasTwoPages ? ' (2 páginas)' : ''}`);
      }

      console.log('Todos los certificados generados, creando ZIP...');

      // Generar archivo ZIP
      const zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: {
          level: 6
        }
      });

      console.log('ZIP creado, tamaño:', (zipBlob.size / 1024 / 1024).toFixed(2), 'MB');

      // Descargar ZIP
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'certificados.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('Descarga iniciada exitosamente');

      setIsGenerating(false);

      // Toast de éxito
      toast.success(`¡${excelData.length} certificados generados exitosamente!${hasTwoPages ? ' (con anverso y reverso)' : ''} 🎉`, {
        duration: 4000,
      });
    } catch (error) {
      console.error('Error al generar certificados:', error);
      await Swal.fire({
        title: 'Error al generar',
        text: error.message,
        icon: 'error',
        confirmButtonColor: '#9333ea',
        confirmButtonText: 'Entendido'
      });
      setIsGenerating(false);
    }
  };

  // Configurar columnas para React Table
  const columns = useMemo(() => {
    if (excelHeaders.length === 0) return [];

    return [
      {
        accessorKey: 'index',
        header: '#',
        cell: ({ row }) => <span className="text-gray-500 font-medium">{row.index + 1}</span>,
        size: 50,
      },
      ...excelHeaders.map((header, idx) => ({
        accessorKey: `col_${idx}`,
        header: header,
        cell: (info) => info.getValue() || <span className="text-gray-400">-</span>,
      })),
    ];
  }, [excelHeaders]);

  // Preparar datos para React Table
  const tableData = useMemo(() => {
    return excelData.map((row) => {
      const rowObj = {};
      excelHeaders.forEach((_, idx) => {
        rowObj[`col_${idx}`] = row[idx];
      });
      return rowObj;
    });
  }, [excelData, excelHeaders]);

  // Configurar React Table
  const table = useReactTable({
    data: tableData,
    columns,
    state: {
      globalFilter,
      sorting,
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
      {/* Toast notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#fff',
            color: '#374151',
            padding: '16px',
            borderRadius: '12px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
            fontSize: '14px',
            fontWeight: '500',
          },
          success: {
            iconTheme: {
              primary: '#9333ea',
              secondary: '#fff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />

      {/* Header fijo estilo Canva con logo */}
      <header className="bg-white border-b border-gray-200 shadow-sm px-6 py-3 flex items-center justify-between">
        <div
          className="flex items-center gap-4 cursor-pointer group"
          onClick={async () => {
            const result = await Swal.fire({
              title: '¿Volver al inicio?',
              text: 'Se perderán todos los cambios no guardados',
              icon: 'question',
              showCancelButton: true,
              confirmButtonColor: '#9333ea',
              cancelButtonColor: '#6b7280',
              confirmButtonText: 'Sí, volver al inicio',
              cancelButtonText: 'Cancelar',
              backdrop: true,
              customClass: {
                popup: 'rounded-2xl',
                confirmButton: 'rounded-lg px-6 py-3',
                cancelButton: 'rounded-lg px-6 py-3'
              }
            });

            if (result.isConfirmed) {
              setStep(1);
              setBackgroundImage(null);
              setBackgroundImages([]);
              setCurrentPageIndex(0);
              setExcelData([]);
              setExcelHeaders([]);
              setFields([]);
              setFieldsPage2([]);
              setSelectedFieldId(null);
              setPreviewIndex(0);
              toast.success('Proyecto reiniciado correctamente');
            }
          }}
        >
          {/* Logo */}
          <img
            src="/img/logo.png"
            alt="Logo"
            className="h-12 w-12 object-contain transition-transform group-hover:scale-110"
          />
          <div className="flex flex-col">
            <h1 className="text-lg font-bold text-gray-800 group-hover:text-purple-600 transition-colors">
              Generador de Certificados
            </h1>
            {step >= 3 && (
              <span className="text-xs text-purple-600 font-medium">
                {step === 3 ? '✨ Diseñar' : step === 4 ? '👁️ Vista Previa' : '🚀 Generar'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Indicador de pasos compacto */}
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map((num) => (
              <div
                key={num}
                className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step >= num
                    ? 'bg-gradient-to-br from-purple-600 to-purple-700 text-white shadow-md'
                    : 'bg-gray-200 text-gray-500'
                } ${step === num ? 'ring-2 ring-purple-300 ring-offset-2' : ''}`}
              >
                {step > num ? <Check className="w-4 h-4" /> : num}
              </div>
            ))}
          </div>

          {/* Enlace a Herramientas */}
          <Link
            to="/herramientas"
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 hover:bg-purple-50 hover:border-purple-400 transition-colors font-semibold text-gray-700 group"
          >
            <Wrench className="w-4 h-4 group-hover:text-purple-600 transition-colors" />
            <span>Herramientas</span>
          </Link>
        </div>
      </header>

      {/* Contenido principal */}
      <div className="flex-1 flex overflow-hidden">
        {/* PASO 1: SUBIR IMAGEN */}
        {step === 1 && (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            {!backgroundImage ? (
              <div className="max-w-2xl w-full">
                <div className="text-center mb-8">
                  <div className="inline-block bg-purple-100 text-purple-700 px-4 py-1 rounded-full text-sm font-semibold mb-4">
                    Paso 1 de 5
                  </div>
                  <h2 className="text-4xl font-bold text-gray-800 mb-3">Sube tu imagen de fondo</h2>
                  <p className="text-gray-600 text-lg">
                    La imagen mantendrá sus <span className="font-semibold text-purple-600">dimensiones originales</span>
                  </p>
                </div>

                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-3 border-dashed border-gray-300 rounded-3xl p-20 text-center hover:border-purple-500 hover:bg-gradient-to-br hover:from-purple-50 hover:to-pink-50 cursor-pointer transition-all duration-300 transform hover:scale-[1.02]"
                >
                  <div className="bg-purple-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Upload className="w-10 h-10 text-purple-600" />
                  </div>
                  <p className="text-xl text-gray-800 font-bold mb-2">Haz clic para seleccionar</p>
                  <p className="text-sm text-gray-500">o arrastra tu archivo aquí</p>
                  <p className="text-xs text-gray-400 mt-4">PNG, JPG, JPEG o PDF • Máximo 10MB</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf,application/pdf"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center w-full">
                <div className="text-center mb-4">
                  <div className="inline-block bg-green-100 text-green-700 px-4 py-2 rounded-full text-sm font-semibold mb-2">
                    ✓ {backgroundImages.length > 1 ? `PDF con ${backgroundImages.length} páginas cargado` : 'Imagen cargada correctamente'}
                  </div>
                  <p className="text-gray-600 text-sm">Dimensiones: {canvasWidth}x{canvasHeight}px</p>
                </div>

                {/* Tabs para anverso/reverso si hay 2 páginas */}
                {backgroundImages.length > 1 && (
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => {
                        setCurrentPageIndex(0);
                        const page = backgroundImages[0];
                        setBackgroundImage(page.imageData);
                        setCanvasWidth(page.width);
                        setCanvasHeight(page.height);
                      }}
                      className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                        currentPageIndex === 0
                          ? 'bg-purple-600 text-white shadow-lg'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Anverso (Página 1)
                    </button>
                    <button
                      onClick={() => {
                        setCurrentPageIndex(1);
                        const page = backgroundImages[1];
                        setBackgroundImage(page.imageData);
                        setCanvasWidth(page.width);
                        setCanvasHeight(page.height);
                      }}
                      className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                        currentPageIndex === 1
                          ? 'bg-purple-600 text-white shadow-lg'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      Reverso (Página 2)
                    </button>
                  </div>
                )}

                <div className="mb-8 bg-white shadow-2xl rounded-2xl p-3 ring-1 ring-gray-200">
                  <canvas
                    ref={canvasRef}
                    width={canvasWidth}
                    height={canvasHeight}
                    className="max-h-[70vh] w-auto rounded-lg"
                    style={{ maxWidth: '90vw' }}
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={() => {
                      setBackgroundImage(null);
                      setBackgroundImages([]);
                      setCurrentPageIndex(0);
                      if (fileInputRef.current) {
                        fileInputRef.current.value = '';
                      }
                    }}
                    className="px-8 py-3 rounded-xl border-2 border-gray-300 hover:border-purple-400 hover:bg-purple-50 transition-all font-semibold text-gray-700"
                  >
                    Cambiar imagen
                  </button>
                  <button
                    onClick={() => setStep(2)}
                    className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-10 py-4 rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    Continuar al siguiente paso →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PASO 2: CARGAR EXCEL */}
        {step === 2 && (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            {excelData.length === 0 ? (
              <div className="max-w-2xl w-full">
                <div className="text-center mb-8">
                  <div className="inline-block bg-purple-100 text-purple-700 px-4 py-1 rounded-full text-sm font-semibold mb-4">
                    Paso 2 de 5
                  </div>
                  <h2 className="text-4xl font-bold text-gray-800 mb-3">Carga tus datos</h2>
                  <p className="text-gray-600 text-lg mb-4">
                    Sube un archivo Excel con los participantes
                  </p>

                  {/* Banner informativo UNAMAD */}
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 mb-6">
                    <div className="flex items-start gap-4">
                      <div className="bg-blue-100 p-3 rounded-full">
                        <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="font-bold text-blue-900 mb-2">Formato Obligatorio - UNAMAD</h3>
                        <p className="text-sm text-blue-800 mb-3">
                          Tu archivo debe cumplir con la normativa de certificados de la <strong>Universidad Nacional Amazónica de Madre de Dios</strong>.
                        </p>
                        <p className="text-sm text-blue-700 mb-2 font-semibold">Las primeras 4 columnas deben ser:</p>
                        <ol className="text-sm text-blue-800 ml-5 mb-4 list-decimal">
                          <li>numero_secuencial</li>
                          <li>numero_documento</li>
                          <li>nombre_completo</li>
                          <li>cargo</li>
                        </ol>
                        <a
                          href="/files/formato_permitido.xlsx"
                          download="formato_permitido.xlsx"
                          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-semibold text-sm shadow-md"
                        >
                          <Download className="w-4 h-4" />
                          Descargar formato permitido
                        </a>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  onClick={() => excelInputRef.current?.click()}
                  className="border-3 border-dashed border-gray-300 rounded-3xl p-20 text-center hover:border-purple-500 hover:bg-gradient-to-br hover:from-purple-50 hover:to-pink-50 cursor-pointer transition-all duration-300 transform hover:scale-[1.02]"
                >
                  <div className="bg-green-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Upload className="w-10 h-10 text-green-600" />
                  </div>
                  <p className="text-xl text-gray-800 font-bold mb-2">Haz clic para subir Excel</p>
                  <p className="text-sm text-gray-500">Asegúrate de usar el formato permitido</p>
                  <p className="text-xs text-gray-400 mt-4">Formato .xlsx o .xls</p>
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleExcelUpload}
                    className="hidden"
                  />
                </div>

                <div className="mt-8 text-center">
                  <button
                    onClick={() => setStep(1)}
                    className="text-gray-600 hover:text-purple-600 font-semibold transition-colors"
                  >
                    ← Volver al paso anterior
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-7xl mx-auto">
                {/* Header con búsqueda */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="inline-block bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-semibold mb-2">
                        Paso 2 de 5
                      </div>
                      <h3 className="text-3xl font-bold text-gray-800">
                        <span className="text-green-600">{excelData.length}</span> participantes cargados ✓
                      </h3>
                    </div>
                    <button
                      onClick={() => {
                        setExcelData([]);
                        setExcelHeaders([]);
                        setGlobalFilter('');
                      }}
                      className="text-sm text-gray-600 hover:text-red-600 font-medium transition-colors"
                    >
                      Cambiar archivo
                    </button>
                  </div>

                  {/* Barra de búsqueda */}
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                    <input
                      type="text"
                      value={globalFilter ?? ''}
                      onChange={(e) => setGlobalFilter(e.target.value)}
                      placeholder="Buscar en todos los campos..."
                      className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-400 focus:ring-2 focus:ring-purple-100 transition-all outline-none text-gray-700"
                    />
                  </div>
                </div>

                {/* Tabla con TanStack React Table */}
                <div className="bg-white rounded-2xl shadow-xl overflow-hidden ring-1 ring-gray-200">
                  <div className="overflow-auto max-h-[calc(100vh-24rem)]">
                    <table className="w-full text-sm">
                      <thead className="bg-gradient-to-r from-purple-50 to-pink-50 sticky top-0">
                        {table.getHeaderGroups().map((headerGroup) => (
                          <tr key={headerGroup.id}>
                            {headerGroup.headers.map((header) => (
                              <th
                                key={header.id}
                                className="px-6 py-4 text-left font-bold text-gray-700 border-b-2 border-purple-200"
                              >
                                {header.isPlaceholder ? null : (
                                  <div
                                    className={`flex items-center gap-2 ${
                                      header.column.getCanSort() ? 'cursor-pointer select-none hover:text-purple-600' : ''
                                    }`}
                                    onClick={header.column.getToggleSortingHandler()}
                                  >
                                    {flexRender(header.column.columnDef.header, header.getContext())}
                                    {header.column.getCanSort() && (
                                      <ArrowUpDown className="w-4 h-4 text-gray-400" />
                                    )}
                                    {{
                                      asc: ' 🔼',
                                      desc: ' 🔽',
                                    }[header.column.getIsSorted()] ?? null}
                                  </div>
                                )}
                              </th>
                            ))}
                          </tr>
                        ))}
                      </thead>
                      <tbody>
                        {table.getRowModel().rows.map((row) => (
                          <tr key={row.id} className="hover:bg-purple-50 border-b transition-colors">
                            {row.getVisibleCells().map((cell) => (
                              <td key={cell.id} className="px-6 py-3 text-gray-700">
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Paginación */}
                <div className="mt-6 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Mostrando {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1} a{' '}
                    {Math.min((table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize, table.getFilteredRowModel().rows.length)}{' '}
                    de {table.getFilteredRowModel().rows.length} registros
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => table.setPageIndex(0)}
                      disabled={!table.getCanPreviousPage()}
                      className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      ««
                    </button>
                    <button
                      onClick={() => table.previousPage()}
                      disabled={!table.getCanPreviousPage()}
                      className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      ← Anterior
                    </button>
                    <span className="px-4 py-2 text-sm font-medium text-gray-700">
                      Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()}
                    </span>
                    <button
                      onClick={() => table.nextPage()}
                      disabled={!table.getCanNextPage()}
                      className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                    >
                      Siguiente →
                    </button>
                    <button
                      onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                      disabled={!table.getCanNextPage()}
                      className="px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      »»
                    </button>
                  </div>

                  <select
                    value={table.getState().pagination.pageSize}
                    onChange={(e) => table.setPageSize(Number(e.target.value))}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none"
                  >
                    {[10, 20, 50, 100].map((pageSize) => (
                      <option key={pageSize} value={pageSize}>
                        Mostrar {pageSize}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Botones de navegación */}
                <div className="flex gap-4 mt-8 justify-center">
                  <button
                    onClick={() => setStep(1)}
                    className="px-8 py-3 rounded-xl border-2 border-gray-300 hover:border-purple-400 hover:bg-purple-50 transition-all font-semibold text-gray-700"
                  >
                    ← Volver
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    className="bg-gradient-to-r from-purple-600 to-purple-700 text-white px-10 py-4 rounded-xl hover:from-purple-700 hover:to-purple-800 transition-all font-bold text-lg shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    Continuar al diseño →
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* PASO 3: POSICIONAR CAMPOS - ESTILO CANVA */}
        {step === 3 && (
          <>
            {/* Panel lateral izquierdo */}
            <aside className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
              {/* Tabs para anverso/reverso si hay 2 páginas */}
              {backgroundImages.length > 1 && (
                <div className="p-3 border-b border-gray-200 bg-gray-50">
                  <div className="flex gap-1">
                    <button
                      onClick={() => {
                        setCurrentPageIndex(0);
                        setSelectedFieldId(null);
                        const page = backgroundImages[0];
                        setBackgroundImage(page.imageData);
                        setCanvasWidth(page.width);
                        setCanvasHeight(page.height);
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                        currentPageIndex === 0
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      Anverso
                    </button>
                    <button
                      onClick={() => {
                        setCurrentPageIndex(1);
                        setSelectedFieldId(null);
                        const page = backgroundImages[1];
                        setBackgroundImage(page.imageData);
                        setCanvasWidth(page.width);
                        setCanvasHeight(page.height);
                      }}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                        currentPageIndex === 1
                          ? 'bg-purple-600 text-white shadow-md'
                          : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      Reverso
                    </button>
                  </div>
                </div>
              )}

              <div className="p-4 border-b border-gray-200">
                <button
                  onClick={() => setShowAddFieldModal(true)}
                  className="w-full bg-purple-600 text-white px-4 py-3 rounded-lg hover:bg-purple-700 transition-colors font-semibold flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Agregar Campo {backgroundImages.length > 1 ? `(${currentPageIndex === 0 ? 'Anverso' : 'Reverso'})` : ''}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {getCurrentFields().length === 0 ? (
                  <div className="text-center text-gray-400 mt-8">
                    <p className="text-sm">Agrega campos para comenzar</p>
                    {backgroundImages.length > 1 && (
                      <p className="text-xs mt-2">Editando: {currentPageIndex === 0 ? 'Anverso' : 'Reverso'}</p>
                    )}
                  </div>
                ) : (
                  getCurrentFields().map((field) => (
                    <div
                      key={field.id}
                      className={`border rounded-lg p-3 cursor-pointer transition-all ${
                        selectedFieldId === field.id
                          ? 'border-purple-500 bg-purple-50 shadow-md'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedFieldId(field.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        {/* Icono según tipo de campo */}
                        <div className={`p-2 rounded-lg ${
                          selectedFieldId === field.id ? 'bg-purple-100' : 'bg-gray-100'
                        }`}>
                          {field.fieldType === 'static' ? (
                            <FileText className={`w-4 h-4 ${
                              selectedFieldId === field.id ? 'text-purple-600' : 'text-gray-600'
                            }`} />
                          ) : (
                            <Database className={`w-4 h-4 ${
                              selectedFieldId === field.id ? 'text-purple-600' : 'text-gray-600'
                            }`} />
                          )}
                        </div>

                        {/* Información del campo */}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-gray-800 text-sm mb-1">
                            {field.fieldType === 'static' ? 'Texto' : excelHeaders[field.columnIndex] || 'Campo'}
                          </h4>
                          <p className="text-xs text-gray-600 truncate">
                            {field.fieldType === 'static'
                              ? field.customText || 'Sin texto'
                              : `Columna: ${excelHeaders[field.columnIndex]}`
                            }
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {field.fontFamily} • {field.fontSize}px
                          </p>
                        </div>

                        {/* Botón eliminar */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteField(field.id);
                          }}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Eliminar campo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="p-4 border-t border-gray-200 space-y-2">
                <button
                  onClick={async () => {
                    const totalFields = fields.length + fieldsPage2.length;
                    if (totalFields === 0) {
                      await Swal.fire({
                        title: 'Sin campos',
                        text: 'Debes agregar al menos un campo de texto',
                        icon: 'warning',
                        confirmButtonColor: '#9333ea',
                        confirmButtonText: 'Entendido'
                      });
                      return;
                    }
                    // Volver al anverso para la vista previa
                    if (backgroundImages.length > 1) {
                      setCurrentPageIndex(0);
                      const page = backgroundImages[0];
                      setBackgroundImage(page.imageData);
                      setCanvasWidth(page.width);
                      setCanvasHeight(page.height);
                    }
                    setStep(4);
                  }}
                  className="w-full bg-purple-600 text-white px-4 py-3 rounded-lg hover:bg-purple-700 transition-colors font-semibold"
                >
                  Continuar
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="w-full px-4 py-2 text-gray-600 hover:text-gray-800 font-medium"
                >
                  ← Volver
                </button>
              </div>
            </aside>

            {/* Área principal del canvas */}
            <div className="flex-1 bg-gray-100 flex flex-col items-center justify-center overflow-auto p-8">
              {/* Barra de herramientas flotante (solo visible cuando hay campo seleccionado) */}
              {selectedFieldId && (
                <div className="mb-4 bg-white rounded-xl shadow-2xl border border-gray-200 p-2 flex items-center gap-1">
                  {(() => {
                    const selectedField = getCurrentFields().find(f => f.id === selectedFieldId);
                    if (!selectedField) return null;

                    return (
                      <>
                        {/* Botón Negrita */}
                        <button
                          onClick={() => updateField(selectedFieldId, {
                            fontWeight: selectedField.fontWeight === 'bold' ? 'normal' : 'bold'
                          })}
                          className={`p-2 rounded-lg transition-colors ${
                            selectedField.fontWeight === 'bold'
                              ? 'bg-purple-100 text-purple-700'
                              : 'hover:bg-gray-100 text-gray-700'
                          }`}
                          title="Negrita"
                        >
                          <Bold className="w-5 h-5" />
                        </button>

                        {/* Botón Cursiva */}
                        <button
                          onClick={() => updateField(selectedFieldId, {
                            fontStyle: selectedField.fontStyle === 'italic' ? 'normal' : 'italic'
                          })}
                          className={`p-2 rounded-lg transition-colors ${
                            selectedField.fontStyle === 'italic'
                              ? 'bg-purple-100 text-purple-700'
                              : 'hover:bg-gray-100 text-gray-700'
                          }`}
                          title="Cursiva"
                        >
                          <Italic className="w-5 h-5" />
                        </button>

                        {/* Botón Subrayado */}
                        <button
                          onClick={() => updateField(selectedFieldId, {
                            textDecoration: selectedField.textDecoration === 'underline' ? 'none' : 'underline'
                          })}
                          className={`p-2 rounded-lg transition-colors ${
                            selectedField.textDecoration === 'underline'
                              ? 'bg-purple-100 text-purple-700'
                              : 'hover:bg-gray-100 text-gray-700'
                          }`}
                          title="Subrayado"
                        >
                          <Underline className="w-5 h-5" />
                        </button>

                        {/* Separador */}
                        <div className="w-px h-6 bg-gray-300 mx-1"></div>

                        {/* Botones de Alineación */}
                        <button
                          onClick={() => updateField(selectedFieldId, { textAlign: 'left' })}
                          className={`p-2 rounded-lg transition-colors ${
                            selectedField.textAlign === 'left'
                              ? 'bg-purple-100 text-purple-700'
                              : 'hover:bg-gray-100 text-gray-700'
                          }`}
                          title="Alinear a la izquierda"
                        >
                          <AlignLeft className="w-5 h-5" />
                        </button>

                        <button
                          onClick={() => updateField(selectedFieldId, { textAlign: 'center' })}
                          className={`p-2 rounded-lg transition-colors ${
                            selectedField.textAlign === 'center'
                              ? 'bg-purple-100 text-purple-700'
                              : 'hover:bg-gray-100 text-gray-700'
                          }`}
                          title="Centrar"
                        >
                          <AlignCenter className="w-5 h-5" />
                        </button>

                        <button
                          onClick={() => updateField(selectedFieldId, { textAlign: 'right' })}
                          className={`p-2 rounded-lg transition-colors ${
                            selectedField.textAlign === 'right'
                              ? 'bg-purple-100 text-purple-700'
                              : 'hover:bg-gray-100 text-gray-700'
                          }`}
                          title="Alinear a la derecha"
                        >
                          <AlignRight className="w-5 h-5" />
                        </button>

                        {/* Separador */}
                        <div className="w-px h-6 bg-gray-300 mx-1"></div>

                        {/* Selector de Fuente */}
                        <select
                          value={selectedField.fontFamily || 'Arial'}
                          onChange={(e) => updateField(selectedFieldId, { fontFamily: e.target.value })}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none min-w-[140px]"
                          style={{ fontFamily: selectedField.fontFamily || 'Arial' }}
                        >
                          {availableFonts.map((font) => (
                            <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                              {font.name}
                            </option>
                          ))}
                        </select>

                        {/* Separador */}
                        <div className="w-px h-6 bg-gray-300 mx-1"></div>

                        {/* Tamaño de fuente */}
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => updateField(selectedFieldId, {
                              fontSize: Math.max(8, selectedField.fontSize - 2)
                            })}
                            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                            title="Reducir tamaño"
                          >
                            <span className="text-lg font-bold">−</span>
                          </button>
                          <input
                            type="number"
                            value={selectedField.fontSize}
                            onChange={(e) => updateField(selectedFieldId, { fontSize: parseInt(e.target.value) || 12 })}
                            min="8"
                            max="200"
                            className="w-14 px-2 py-1 border border-gray-300 rounded text-center text-sm focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none"
                          />
                          <button
                            onClick={() => updateField(selectedFieldId, {
                              fontSize: Math.min(200, selectedField.fontSize + 2)
                            })}
                            className="p-1.5 hover:bg-gray-100 rounded transition-colors"
                            title="Aumentar tamaño"
                          >
                            <span className="text-lg font-bold">+</span>
                          </button>
                        </div>

                        {/* Separador */}
                        <div className="w-px h-6 bg-gray-300 mx-1"></div>

                        {/* Selector de Color */}
                        <div className="relative">
                          <input
                            type="color"
                            value={selectedField.color}
                            onChange={(e) => updateField(selectedFieldId, { color: e.target.value })}
                            className="w-10 h-10 rounded-lg cursor-pointer border-2 border-gray-300"
                            title="Color de texto"
                          />
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              <div className="bg-white shadow-2xl rounded-lg p-2">
                <canvas
                  ref={canvasRef}
                  width={canvasWidth}
                  height={canvasHeight}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  className="cursor-crosshair max-h-[85vh] w-auto"
                  style={{ maxWidth: 'calc(100vw - 24rem)' }}
                />
              </div>
            </div>
          </>
        )}

        {/* PASO 4: VISTA PREVIA - ESTILO CANVA */}
        {step === 4 && (
          <div className="flex-1 flex flex-col">
            {/* Barra de navegación superior */}
            <div className="bg-white border-b border-gray-200 px-8 py-4 flex items-center justify-between">
              <button
                onClick={() => setPreviewIndex(Math.max(0, previewIndex - 1))}
                disabled={previewIndex === 0}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              <div className="text-center">
                <p className="text-lg font-semibold text-gray-800">
                  Certificado {previewIndex + 1} de {excelData.length}
                </p>
                <p className="text-sm text-gray-500">
                  {excelData[previewIndex][0]}
                </p>
                {backgroundImages.length > 1 && (
                  <p className="text-xs text-purple-600 font-medium mt-1">
                    Viendo: {currentPageIndex === 0 ? 'Anverso' : 'Reverso'}
                  </p>
                )}
              </div>

              <button
                onClick={() => setPreviewIndex(Math.min(excelData.length - 1, previewIndex + 1))}
                disabled={previewIndex === excelData.length - 1}
                className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            </div>

            {/* Tabs para anverso/reverso si hay 2 páginas */}
            {backgroundImages.length > 1 && (
              <div className="bg-gray-50 border-b border-gray-200 px-8 py-3 flex justify-center">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setCurrentPageIndex(0);
                      const page = backgroundImages[0];
                      setBackgroundImage(page.imageData);
                      setCanvasWidth(page.width);
                      setCanvasHeight(page.height);
                    }}
                    className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                      currentPageIndex === 0
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    Anverso
                  </button>
                  <button
                    onClick={() => {
                      setCurrentPageIndex(1);
                      const page = backgroundImages[1];
                      setBackgroundImage(page.imageData);
                      setCanvasWidth(page.width);
                      setCanvasHeight(page.height);
                    }}
                    className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                      currentPageIndex === 1
                        ? 'bg-purple-600 text-white shadow-md'
                        : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    Reverso
                  </button>
                </div>
              </div>
            )}

            {/* Canvas centrado */}
            <div className="flex-1 bg-gray-100 flex items-center justify-center p-8">
              <div className="bg-white shadow-2xl rounded-lg p-2">
                <canvas
                  ref={canvasRef}
                  width={canvasWidth}
                  height={canvasHeight}
                  className="max-h-[75vh] w-auto"
                  style={{ maxWidth: '90vw' }}
                />
              </div>
            </div>

            {/* Botones inferiores */}
            <div className="bg-white border-t border-gray-200 px-8 py-4 flex items-center justify-center gap-4">
              <button
                onClick={() => setStep(3)}
                className="px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-semibold"
              >
                ← Volver a editar
              </button>
              <button
                onClick={() => setStep(5)}
                className="bg-purple-600 text-white px-8 py-3 rounded-lg hover:bg-purple-700 transition-colors font-semibold text-lg shadow-lg"
              >
                Generar Todos
              </button>
            </div>
          </div>
        )}

        {/* PASO 5: GENERAR Y DESCARGAR - ESTILO CANVA */}
        {step === 5 && (
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="max-w-2xl w-full text-center space-y-8">
              <div>
                <h2 className="text-4xl font-bold text-gray-800 mb-3">
                  {isGenerating ? 'Generando certificados...' : '¡Todo listo!'}
                </h2>
                <p className="text-gray-600 text-lg">
                  {isGenerating
                    ? `Procesando ${generationProgress} de ${excelData.length}`
                    : `${excelData.length} certificados listos para generar`}
                </p>
              </div>

              {!isGenerating ? (
                <>
                  <div className="bg-gradient-to-br from-purple-500 to-purple-700 rounded-2xl p-12 text-white shadow-2xl">
                    <div className="text-7xl font-bold mb-4">{excelData.length}</div>
                    <p className="text-xl opacity-90">Certificados</p>
                    {backgroundImages.length > 1 && (
                      <p className="text-sm opacity-75 mt-2">Con anverso y reverso</p>
                    )}
                  </div>

                  <button
                    onClick={generateAllCertificates}
                    className="bg-purple-600 text-white px-12 py-5 rounded-xl hover:bg-purple-700 transition-all font-bold text-xl flex items-center gap-4 mx-auto shadow-2xl hover:scale-105"
                  >
                    <Download className="w-8 h-8" />
                    Generar y Descargar ZIP
                  </button>

                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 text-left">
                    <h4 className="font-semibold text-purple-900 mb-3 text-lg">Detalles de la descarga:</h4>
                    <ul className="text-sm text-purple-800 space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="text-purple-600">•</span>
                        <span>Formato: ZIP con archivos PDF {backgroundImages.length > 1 ? '(2 páginas por certificado)' : `(A4 ${canvasWidth > canvasHeight ? 'horizontal' : 'vertical'})`}</span>
                      </li>
                      {backgroundImages.length > 1 && (
                        <li className="flex items-start gap-2">
                          <span className="text-purple-600">•</span>
                          <span>Páginas: Anverso ({fields.length} campos) + Reverso ({fieldsPage2.length} campos)</span>
                        </li>
                      )}
                      <li className="flex items-start gap-2">
                        <span className="text-purple-600">•</span>
                        <span>Resolución: Calidad profesional apta para impresión</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-purple-600">•</span>
                        <span>Nombres: numero_secuencial_documento_nombre_(cargo).pdf</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-purple-600">•</span>
                        <span>Tiempo estimado: {Math.ceil(excelData.length / (backgroundImages.length > 1 ? 3 : 5))} segundos</span>
                      </li>
                    </ul>
                  </div>

                  <div className="flex gap-4 justify-center">
                    <button
                      onClick={() => setStep(4)}
                      className="px-6 py-3 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors font-semibold"
                    >
                      ← Volver
                    </button>
                    <button
                      onClick={() => {
                        setStep(1);
                        setBackgroundImage(null);
                        setBackgroundImages([]);
                        setCurrentPageIndex(0);
                        setExcelData([]);
                        setExcelHeaders([]);
                        setFields([]);
                        setFieldsPage2([]);
                        setSelectedFieldId(null);
                        setPreviewIndex(0);
                      }}
                      className="px-6 py-3 rounded-lg text-gray-600 hover:text-gray-800 font-semibold"
                    >
                      Nuevo Proyecto
                    </button>
                  </div>
                </>
              ) : (
                <div className="space-y-6">
                  <div className="relative">
                    <div className="w-full bg-gray-200 rounded-full h-6 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-purple-500 to-purple-600 h-full transition-all duration-500 flex items-center justify-end pr-3"
                        style={{ width: `${(generationProgress / excelData.length) * 100}%` }}
                      >
                        <span className="text-white text-xs font-bold">
                          {Math.round((generationProgress / excelData.length) * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-xl p-8 shadow-lg">
                    <div className="flex items-center justify-center gap-3 text-gray-600">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                      <span className="font-medium">Procesando certificados...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Modal para agregar campo */}
      {showAddFieldModal && (
        <div className="fixed inset-0 bg-white bg-opacity-20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            {/* Header del modal */}
            <div className="bg-gradient-to-r from-purple-600 to-purple-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">Selecciona el tipo de campo</h3>
              <button
                onClick={() => setShowAddFieldModal(false)}
                className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-1 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Cuerpo del modal */}
            <div className="p-6 space-y-4">
              {/* Opciones de tipo de campo */}
              <div className="space-y-3">
                {/* Opción: Campo de datos del Excel */}
                <div
                  onClick={() => setNewFieldType('data')}
                  className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                    newFieldType === 'data'
                      ? 'border-purple-500 bg-purple-50 shadow-md'
                      : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${newFieldType === 'data' ? 'bg-purple-100' : 'bg-gray-100'}`}>
                      <Database className={`w-6 h-6 ${newFieldType === 'data' ? 'text-purple-600' : 'text-gray-600'}`} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800 mb-1">Campo de datos del Excel</h4>
                      <p className="text-sm text-gray-600">Vincula este campo a una columna del Excel</p>
                    </div>
                  </div>
                </div>

                {/* Opción: Texto libre/estático */}
                <div
                  onClick={() => setNewFieldType('static')}
                  className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
                    newFieldType === 'static'
                      ? 'border-purple-500 bg-purple-50 shadow-md'
                      : 'border-gray-200 hover:border-purple-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${newFieldType === 'static' ? 'bg-purple-100' : 'bg-gray-100'}`}>
                      <FileText className={`w-6 h-6 ${newFieldType === 'static' ? 'text-purple-600' : 'text-gray-600'}`} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-800 mb-1">Texto libre/estático</h4>
                      <p className="text-sm text-gray-600">Escribe un texto que será igual en todos los certificados</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Configuración según el tipo seleccionado */}
              <div className="pt-4 border-t border-gray-200">
                {newFieldType === 'data' ? (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Selecciona la columna del Excel:
                    </label>
                    <select
                      value={newFieldColumnIndex}
                      onChange={(e) => setNewFieldColumnIndex(parseInt(e.target.value))}
                      className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-gray-700"
                    >
                      {excelHeaders.map((header, idx) => (
                        <option key={idx} value={idx}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Escribe el texto estático:
                    </label>
                    <input
                      type="text"
                      value={newFieldStaticText}
                      onChange={(e) => setNewFieldStaticText(e.target.value)}
                      placeholder="Ej: Certificado de Participación"
                      className="w-full px-4 py-2.5 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-100 outline-none text-gray-700"
                    />
                  </div>
                )}

                {/* Opciones de alineación */}
                <div className="mt-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Alineación del texto:
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setNewFieldAlignment('left')}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all ${
                        newFieldAlignment === 'left'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-300 hover:border-purple-300 text-gray-700'
                      }`}
                    >
                      <AlignLeft className="w-4 h-4" />
                      <span className="font-medium text-sm">Izquierda</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewFieldAlignment('center')}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 transition-all ${
                        newFieldAlignment === 'center'
                          ? 'border-purple-500 bg-purple-50 text-purple-700'
                          : 'border-gray-300 hover:border-purple-300 text-gray-700'
                      }`}
                    >
                      <AlignCenter className="w-4 h-4" />
                      <span className="font-medium text-sm">Centrado</span>
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {newFieldAlignment === 'left'
                      ? 'El texto iniciará desde la posición del campo hacia la derecha'
                      : 'El texto se centrará en la posición del campo'
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Footer del modal */}
            <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={() => setShowAddFieldModal(false)}
                className="px-5 py-2.5 rounded-lg border-2 border-gray-300 hover:bg-gray-100 font-semibold text-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={addFieldFromModal}
                disabled={newFieldType === 'static' && !newFieldStaticText.trim()}
                className="px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold transition-colors shadow-md"
              >
                Agregar Campo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GeneradorCertificados;
