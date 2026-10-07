(function (root) {
  const S = root.ApplicationSchema;
  const headings = {
    education: /^(教育背景|教育经历|教育信息|学历信息)$/,
    projects: /^(项目经历|项目经验|项目\/实习经历)$/,
    campus: /^(校园实践|校园经历|社会实践|志愿活动)$/,
    work: /^(工作经历|实习经历|工作经验)$/,
    certificates: /^(资格证书|技能证书|证书情况)$/,
    achievements: /^(专利成果|取得成果|科研成果|论文成果)$/,
    awards: /^(荣誉奖励|奖惩情况|奖励情况|获奖情况)$/,
    text: /^(专业技能|技能特长|自我评价|爱好特长|计算机技能)$/
  };
  function normalizedDate(value) {
    const match = value.trim().match(/^(\d{4})[.\/-](\d{1,2})(?:[.\/-](\d{1,2}))?$/);
    return match ? `${match[1]}-${match[2].padStart(2, '0')}${match[3] ? '-' + match[3].padStart(2, '0') : ''}` : '';
  }
  const rangeRegex = /(\d{4}[.\/-]\d{1,2}(?:[.\/-]\d{1,2})?)\s*(?:至|到|[-—–~～]{1,2})\s*(\d{4}[.\/-]\d{1,2}(?:[.\/-]\d{1,2})?|至今|现在)/;
  function parseText(text, source = '') {
    const profile = S.emptyProfile();
    profile._meta.source = source;
    profile._meta.reviewNotes = ['这是本机规则 / OCR 提取的草稿。应用前请核对姓名、日期、证书状态和本人职责；未识别内容可从原文手动整理。'];
    const lines = text.split(/\r?\n/).map(s => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const sections = {}, general = []; let current = '', textHeading = '';
    for (const line of lines) {
      const heading = line.replace(/[：:]$/, '').trim();
      const group = Object.keys(headings).find(g => headings[g].test(heading));
      if (group) { current = group; textHeading = group === 'text' ? heading : ''; sections[current] ||= []; continue; }
      if (current) sections[current].push({ line, heading: textHeading }); else general.push(line);
      const pair = line.match(/^([^：:]{1,30})[：:]\s*(.+)$/);
      if (pair) {
        const label = S.normalize(pair[1]);
        const target = S.groups.basic.fields.find(f => f.aliases.some(a => S.normalize(a) === label));
        if (target && !profile.basic[target.key]) profile.basic[target.key] = target.date ? normalizedDate(pair[2]) || pair[2] : pair[2];
        const long = S.groups.text.fields.find(f => f.aliases.some(a => S.normalize(a) === label));
        if (long && !profile.text[long.key]) profile.text[long.key] = pair[2];
      }
    }
    const header = general.join('\n');
    profile.basic.phone ||= header.match(/(?<!\d)1[3-9]\d{9}(?!\d)/)?.[0] || '';
    profile.basic.email ||= header.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
    if (!profile.basic.name && /^[\p{Script=Han}]{2,5}$/u.test(general[0] || '') && !/简历|信息|应聘|简介/.test(general[0])) profile.basic.name = general[0];
    function blocks(group) {
      const input = (sections[group] || []).map(x => x.line), out = [];
      let block = null;
      for (const line of input) {
        const match = line.match(rangeRegex);
        if (match) {
          if (block) out.push(block);
          block = { start: normalizedDate(match[1]), end: normalizedDate(match[2]) || match[2], lines: [] };
          const remaining = line.replace(match[0], '').trim(); if (remaining) block.lines.push(remaining);
        } else if (block) block.lines.push(line);
      }
      if (block) out.push(block); return out;
    }
    for (const b of blocks('education')) {
      const r = S.blankRecord('education'); r.start = b.start; r.end = b.end; r.dateRange = `${b.start} 至 ${b.end}`;
      r.school = b.lines.find(l => /大学|学院|学校/.test(l) && !/课程|职责/.test(l)) || '';
      r.major = b.lines.find(l => /专业[：:]/.test(l))?.replace(/^.*?专业[：:]\s*/, '') || b.lines.find(l => /科学|工程|技术|学$/.test(l) && !/大学|学院|学校|学历|学位/.test(l)) || '';
      r.qualification = b.lines.find(l => /^(本科|统招本科|大学本科|专科|硕士|博士)$/.test(l)) || '';
      r.degree = b.lines.find(l => /学士|硕士学位|博士学位/.test(l)) || '';
      r.mode = b.lines.find(l => /^(全日制|非全日制)$/.test(l)) || '';
      r.courses = b.lines.filter(l => /^主修课程[：:]/.test(l)).map(l => l.replace(/^主修课程[：:]\s*/, '')).join('\n');
      profile.education.push(r);
    }
    for (const group of ['projects', 'campus', 'work']) for (const b of blocks(group)) {
      const r = S.blankRecord(group); r.start = b.start; r.end = b.end;
      if (group === 'work') r.organization = b.lines[0] || ''; else r.name = b.lines[0] || '';
      r.role = b.lines.find(l => /^(负责人|项目负责人|主要成员|核心成员|成员|队长|实习生)$/.test(l)) || '';
      if (group === 'projects') {
        r.description = b.lines.filter(l => /^项目(介绍|简介|背景|描述)[：:]/.test(l)).map(l => l.replace(/^项目(介绍|简介|背景|描述)[：:]\s*/, '')).join('\n');
        r.results = b.lines.filter(l => /^项目成果[：:]/.test(l)).map(l => l.replace(/^项目成果[：:]\s*/, '')).join('\n');
        r.responsibilities = b.lines.slice(1).filter(l => /[：:]/.test(l) && !/^项目(成果|介绍|简介|背景|描述)[：:]/.test(l)).join('\n');
        r.summary = b.lines.slice(1).filter(l => /[：:]/.test(l)).join('\n');
      } else r.description = b.lines.slice(1).filter(l => l !== r.role).join('\n');
      profile[group].push(r);
    }
    for (const item of sections.text || []) {
      const field = S.groups.text.fields.find(f => f.aliases.includes(item.heading));
      if (field && !item.line.startsWith(field.label + '：')) profile.text[field.key] += (profile.text[field.key] ? '\n' : '') + item.line;
    }
    profile.text.patents ||= (sections.achievements || []).map(x => x.line).join('\n');
    profile.text.honors ||= (sections.awards || []).map(x => x.line).join('\n');
    profile.text.certificates ||= (sections.certificates || []).filter(x => !/专业技能|计算机技能|荣誉奖励/.test(x.line)).map(x => x.line).join('\n');
    return S.validateProfile(profile);
  }
  async function docxText(file) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const part = zip.file('word/document.xml'); if (!part) throw Error('不是有效 DOCX 文件；旧版 DOC 请另存为 DOCX');
    if (part._data?.uncompressedSize > 10 * 1024 * 1024) throw Error('文档正文过大，请分拆后导入');
    const xml = new DOMParser().parseFromString(await part.async('string'), 'application/xml');
    if (xml.querySelector('parsererror')) throw Error('DOCX 正文格式损坏');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    return [...xml.getElementsByTagNameNS(ns, 'p')].map(p => [...p.getElementsByTagNameNS(ns, 't')].map(t => t.textContent).join('')).filter(Boolean).join('\n');
  }
  const asset = path => globalThis.chrome?.runtime?.getURL ? chrome.runtime.getURL(path) : new URL(path, location.href).href;
  async function ocrWorker(progress) {
    return Tesseract.createWorker('chi_sim+eng', 1, { workerPath: asset('vendor/ocr/worker.min.js'), corePath: asset('vendor/ocr/core'), langPath: asset('vendor/ocr/lang'), workerBlobURL: false, gzip: false, cacheMethod: 'none', logger: x => progress?.(`本地 OCR：${x.status} ${Math.round((x.progress || 0) * 100)}%`) });
  }
  async function imageOCR(file, progress, worker) {
    const own = !worker; worker ||= await ocrWorker(progress);
    try {
      const bitmap = await createImageBitmap(file);
      const ratio = Math.min(2, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * ratio); canvas.height = Math.round(bitmap.height * ratio);
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
      const result = await worker.recognize(canvas); return result.data.text;
    } finally { if (own) await worker.terminate(); }
  }
  async function pdfText(file, progress, forceOCR = false) {
    const pdfjs = await import('./vendor/pdfjs/pdf.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = asset('vendor/pdfjs/pdf.worker.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), cMapUrl: asset('vendor/pdfjs/cmaps/'), cMapPacked: true, standardFontDataUrl: asset('vendor/pdfjs/standard_fonts/'), wasmUrl: asset('vendor/pdfjs/wasm/'), isEvalSupported: false });
    let pdf, worker; const pages = [];
    try {
      pdf = await task.promise;
      if (pdf.numPages > 50) throw Error('单个 PDF 最多 50 页，请分拆材料后导入');
      for (let i = 1; i <= pdf.numPages; i++) {
        progress?.(`读取 PDF ${i}/${pdf.numPages} 页`);
        const page = await pdf.getPage(i), content = await page.getTextContent();
        let text = '', y;
        for (const item of content.items) if ('str' in item) {
          if (y !== undefined && Math.abs(item.transform[5] - y) > 4) text += '\n';
          text += item.str + (item.hasEOL ? '\n' : ' '); y = item.transform[5];
        }
        if (forceOCR || text.replace(/\s/g, '').length < 30) {
          worker ||= await ocrWorker(progress);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: Math.min(2.5, 2400 / Math.max(base.width, base.height)) });
          const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
          text = (await worker.recognize(canvas)).data.text;
        }
        pages.push(text); page.cleanup();
      }
      return pages.join('\n\n');
    } catch (error) {
      if (error.name === 'PasswordException') throw Error('PDF 有密码，请解锁后再导入');
      throw error;
    } finally { await worker?.terminate(); await task.destroy(); }
  }
  async function read(file, progress, forceOCR = false) {
    if (file.size > 30 * 1024 * 1024) throw Error('每个材料最大 30 MB');
    const ext = file.name.split('.').at(-1).toLowerCase(); let text = '', profile, backup;
    if (ext === 'json') {
      if (file.size > 8 * 1024 * 1024) throw Error('JSON 最大 8 MB');
      const parsed = JSON.parse(await file.text());
      if (Array.isArray(parsed.profiles)) backup = ApplicationLibrary.validate(parsed); else profile = S.validateProfile(parsed);
    } else if (ext === 'docx') text = await docxText(file);
    else if (ext === 'pdf') text = await pdfText(file, progress, forceOCR);
    else if (['txt', 'md'].includes(ext)) text = await file.text();
    else if (['png', 'jpg', 'jpeg', 'webp', 'bmp'].includes(ext)) text = await imageOCR(file, progress);
    else throw Error('支持 DOCX、PDF、TXT、MD、JSON、PNG、JPG、WEBP、BMP；DOC 请另存为 DOCX');
    if (text.length > 200000) throw Error('正文超出 20 万字符，请分拆后导入');
    if (!profile && !backup) profile = parseText(text, file.name);
    return { name: file.name, format: ext, text, profile, backup, file };
  }
  const api = { parseText, normalizedDate, read, imageOCR, pdfText, docxText }; root.ApplicationImporter = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
