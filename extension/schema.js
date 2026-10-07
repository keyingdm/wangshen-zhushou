/* Shared pure functions. No network, DOM, or browser dependencies. */
(function (root) {
  'use strict';
  const def = (key, label, aliases, extra = {}) => ({ key, label, aliases: [label, ...aliases], ...extra });
  const groups = {
    basic: { label: '基本资料', fields: [
      def('name', '姓名', ['中文姓名', '真实姓名', '全名', 'name', 'fullname', 'full_name'], { autocomplete: ['name'] }),
      def('phone', '手机号码', ['手机号', '联系电话', '手机', 'mobile', 'phone', 'tel'], { autocomplete: ['tel', 'tel-national'] }),
      def('email', '电子邮箱', ['邮箱', '邮件地址', 'email', 'e-mail'], { autocomplete: ['email'] }),
      def('gender', '性别', ['gender', 'sex']),
      def('birthday', '出生日期', ['出生年月', '生日', 'birthdate', 'birthday', 'dateofbirth'], { date: true, autocomplete: ['bday'] }),
      def('nationality', '国籍', ['nationality']), def('ethnicity', '民族', ['ethnicity']),
      def('politicalStatus', '政治面貌', ['政治身份']), def('partyJoinDate', '入党时间', ['入党日期'], { date: true }),
      def('hometown', '籍贯', []), def('hometownProvince', '籍贯省份', ['籍贯省']), def('hometownCity', '籍贯城市', ['籍贯市']),
      def('householdProvince', '户籍省份', ['现户口所在省', '户口省份']), def('householdCity', '户籍城市', ['现户口所在市', '户口城市']),
      def('origin', '生源所在地', ['生源地', '高考时户籍所在地']), def('originProvince', '生源省份', ['生源地省份']), def('originCity', '生源城市', ['生源地城市']),
      def('household', '户籍所在地', ['户籍地址', '户口所在地']), def('city', '现居城市', ['现居地', '居住城市']),
      def('address', '联系地址', ['通讯地址', '通信地址', '详细地址'], { autocomplete: ['street-address'] }),
      def('postalCode', '邮政编码', ['邮编'], { autocomplete: ['postal-code'] }),
      def('idNumber', '身份证号码', ['身份证号', '证件号码', '证件号'], { sensitive: true }),
      def('idType', '证件类型', ['证件种类']), def('maritalStatus', '婚姻状况', ['婚姻情况']),
      def('emergencyName', '紧急联系人', ['紧急联系人姓名'], { sensitive: true }),
      def('emergencyPhone', '紧急电话', ['紧急联系人电话', '紧急联系电话'], { sensitive: true }),
      def('health', '健康状况', ['健康情况']), def('height', '身高', ['身高CM']), def('weight', '体重', ['体重KG']),
      def('language1', '外国语种1', ['外语语种1', '第一外语']), def('languageLevel1', '外语水平1', ['外语等级1', '第一外语水平']),
      def('language2', '外国语种2', ['外语语种2', '第二外语']), def('languageLevel2', '外语水平2', ['外语等级2', '第二外语水平']),
      def('targetRole', '意向岗位', ['求职意向', '期望职位', '应聘岗位']),
      def('targetCity', '意向城市', ['期望工作地点', '期望城市']),
      def('jobType', '求职类型', ['工作性质', '应聘类型']),
      def('salary', '期望薪资', ['薪资期望', '期望月薪']),
      def('availability', '到岗时间', ['可到岗时间', '入职时间'], { date: true })
    ] },
    education: { label: '教育经历', repeat: true, fields: [
      def('school', '学校名称', ['毕业院校', '院校名称', '学校', 'school', 'university']),
      def('major', '专业名称', ['所学专业', '专业', 'major']),
      def('qualification', '学历', ['最高学历', '教育程度', 'educationlevel']),
      def('degree', '学位', ['degree']), def('college', '学院', ['院系', '所属学院']),
      def('start', '入学时间', ['入学日期', '开始时间', '起始时间', '开始日期', 'startdate'], { date: true }),
      def('end', '毕业时间', ['毕业日期', '预计毕业时间', '结束时间', '结束日期', 'enddate'], { date: true }),
      def('mode', '学习形式', ['培养方式', '学习方式', '形式']), def('gpa', '绩点', ['GPA', '平均绩点']),
      def('rank', '专业排名', ['成绩排名', '班级或年级综合排名', '综合排名']),
      def('dateRange', '教育起止时间', ['起止时间', '教育时间']), def('courses', '主修课程', ['课程', '主要课程'], { multiline: true })
    ] },
    projects: { label: '项目经历', repeat: true, fields: [
      def('name', '项目名称', ['项目标题', 'projectname']), def('role', '项目角色', ['担任角色', '担任职务', '项目职务', '角色']),
      def('organization', '所在单位', ['所属单位', '项目单位']), def('city', '项目地点', ['项目城市']),
      def('start', '项目开始时间', ['开始时间', '起始时间', '开始日期', 'startdate'], { date: true }),
      def('end', '项目结束时间', ['结束时间', '结束日期', 'enddate'], { date: true }),
      def('teamSize', '团队规模', ['团队人数', '项目人数']),
      def('description', '项目介绍', ['项目背景', '项目简介', '项目描述'], { multiline: true }),
      def('responsibilities', '项目职责', ['本人职责', '个人职责', '承担工作', '主要职责', '职责描述', '责任描述'], { multiline: true }),
      def('results', '项目成果', ['项目业绩', '项目收获', '成果描述'], { multiline: true }),
      def('summary', '项目经历描述', ['项目内容', '项目详情'], { multiline: true })
    ] },
    campus: { label: '校园实践', repeat: true, fields: [
      def('name', '活动名称', ['实践名称', '校园活动名称', '社团名称']), def('role', '担任职务', ['担任角色', '活动角色', '职务']),
      def('city', '活动地点', ['实践地点']),
      def('start', '活动开始时间', ['开始时间', '开始日期', 'startdate'], { date: true }),
      def('end', '活动结束时间', ['结束时间', '结束日期', 'enddate'], { date: true }),
      def('description', '活动描述', ['实践内容', '活动内容', '校园经历', '实践描述'], { multiline: true })
    ] },
    work: { label: '实习 / 工作', repeat: true, fields: [
      def('organization', '公司名称', ['实习单位', '工作单位', '公司', '雇主', 'company']),
      def('role', '职位名称', ['职位', '岗位', '职务']), def('department', '部门', ['所在部门']),
      def('start', '工作开始时间', ['开始时间', '开始日期', 'startdate'], { date: true }),
      def('end', '工作结束时间', ['结束时间', '结束日期', 'enddate'], { date: true }),
      def('description', '工作内容', ['工作职责', '实习内容', '实习职责', '职责描述'], { multiline: true })
    ] },
    certificates: { label: '资格证书', repeat: true, fields: [
      def('name', '证书名称', ['资格证书名称', '证书', '资格名称']), def('level', '证书等级', ['资格等级', '等级']),
      def('number', '证书编号', ['资格证号', '证书号码'], { sensitive: true }), def('issuer', '发证单位', ['颁发单位', '发证机构']),
      def('date', '取得时间', ['获得时间', '发证时间', '取得日期'], { date: true }), def('score', '证书成绩', ['考试成绩', '分数']),
      def('description', '证书说明', ['资格证书描述', '证书备注'], { multiline: true })
    ] },
    family: { label: '家庭成员', repeat: true, fields: [
      def('relation', '与本人关系', ['关系', '亲属关系'], { sensitive: true }),
      def('name', '家庭成员姓名', ['亲属姓名', '姓名'], { sensitive: true }), def('birthday', '家庭成员出生日期', ['出生日期'], { sensitive: true, date: true }),
      def('organization', '家庭成员工作单位', ['工作单位', '所在单位'], { sensitive: true }),
      def('role', '家庭成员职务', ['职务', '岗位'], { sensitive: true }), def('phone', '家庭成员联系电话', ['联系电话', '手机号码'], { sensitive: true }),
      def('politicalStatus', '家庭成员政治面貌', ['政治面貌'], { sensitive: true })
    ] },
    achievements: { label: '取得成果', repeat: true, fields: [
      def('name', '成果名称', ['专利名称', '论文名称', '成果标题']), def('type', '成果类型', ['成果类别']),
      def('date', '成果取得时间', ['取得时间', '获得时间'], { date: true }), def('number', '成果编号', ['申请号', '专利号']),
      def('status', '成果状态', ['授权状态', '专利状态']), def('role', '本人排名或贡献', ['作者排名', '发明人排名', '本人贡献']),
      def('description', '成果描述', ['成果内容', '成果介绍'], { multiline: true })
    ] },
    awards: { label: '奖惩情况', repeat: true, fields: [
      def('name', '奖惩名称', ['奖励名称', '获奖名称', '奖项名称', '处分名称']), def('type', '奖惩类型', ['奖励或处分', '奖惩类别']),
      def('level', '奖项级别', ['奖励级别', '级别']), def('rank', '获奖等级', ['奖项等级', '奖励等级']),
      def('date', '奖惩时间', ['获奖时间', '奖励时间', '处分时间'], { date: true }), def('issuer', '授予单位', ['颁奖单位', '颁发单位']),
      def('description', '奖惩说明', ['获奖描述', '奖励内容'], { multiline: true })
    ] },
    text: { label: '技能与长文本', fields: [
      def('skills', '专业技能', ['技术技能', '技能描述', '职业技能', '技能特长'], { multiline: true }),
      def('computerSkills', '计算机技能', ['电脑技能'], { multiline: true }),
      def('certificates', '技能证书', ['资格证书', '证书情况', '证书名称'], { multiline: true }),
      def('english', '英语水平', ['外语水平', '英语等级']),
      def('honors', '荣誉奖励', ['获奖情况', '所获荣誉', '奖励情况'], { multiline: true }),
      def('patents', '专利成果', ['专利情况', '专利'], { multiline: true }),
      def('hobbies', '爱好特长', ['兴趣爱好', '个人特长'], { multiline: true }),
      def('selfEvaluation', '自我评价', ['自我介绍', '个人评价'], { multiline: true })
    ] }
  };
  // Retired fields survive old JSON backup round-trips, but never enter UI or filling.
  const retiredDeclarationKeys = ['groupRelative', 'hardshipGraduate', 'relativeAvoidance', 'employedGracePeriod', 'examCity1', 'examCity2'];
  function emptyProfile() {
    const p = { version: 2, _meta: { source: '', reviewNotes: [] } };
    for (const [g, config] of Object.entries(groups)) p[g] = config.repeat ? [] : blankRecord(g);
    return p;
  }
  function blankRecord(group) { return Object.fromEntries(groups[group].fields.map(f => [f.key, ''])); }
  function validateProfile(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('资料必须为 JSON 对象。');
    if (![1, 2].includes(input.version)) throw Error('仅支持 version: 1 或 2 的资料文件。');
    const p = emptyProfile();
    const copyRecord = (record, group) => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw Error(`${groups[group].label}格式不正确。`);
      const result = blankRecord(group);
      for (const f of groups[group].fields) {
        const value = record[f.key] ?? '';
        if (typeof value !== 'string' || value.length > 15000) throw Error(`${f.label}必须是文本，且不能超过 15000 字符。`);
        result[f.key] = value.trim();
      }
      return result;
    };
    for (const [g, c] of Object.entries(groups)) {
      if (c.repeat) {
        const rows = input[g] ?? [];
        if (!Array.isArray(rows) || rows.length > 30) throw Error(`${c.label}最多支持 30 条。`);
        p[g] = rows.map(r => copyRecord(r, g));
      } else p[g] = copyRecord(input[g] ?? {}, g);
    }
    if (input.declarations !== undefined) {
      if (!input.declarations || typeof input.declarations !== 'object' || Array.isArray(input.declarations)) throw Error('旧版栏目备份格式不正确。');
      p.declarations = Object.fromEntries(retiredDeclarationKeys.map(key => {
        const value = input.declarations[key] ?? '';
        if (typeof value !== 'string' || value.length > 15000) throw Error('旧版栏目备份值必须是不超过 15000 字符的文本。');
        return [key, value.trim()];
      }));
    }
    p._meta.source = typeof input._meta?.source === 'string' ? input._meta.source.slice(0, 300) : '';
    p._meta.reviewNotes = Array.isArray(input._meta?.reviewNotes) ? input._meta.reviewNotes.filter(n => typeof n === 'string').slice(0, 30).map(n => n.slice(0, 1000)) : [];
    return p;
  }
  const normalize = s => String(s ?? '').toLowerCase().replace(/[\s＊*：:（）()【】\[\]_.\-–—/]/g, '');
  function entries(profile) {
    const out = [];
    for (const [g, c] of Object.entries(groups)) {
      const records = c.repeat ? profile[g] : [profile[g]];
      records.forEach((r, index) => c.fields.forEach(f => out.push({
        ...f, group: g, index, path: c.repeat ? `${g}.${index}.${f.key}` : `${g}.${f.key}`,
        title: `${c.label}${c.repeat ? ` ${index + 1}` : ''} · ${f.label}`,
        value: r[f.key] || ''
      })));
    }
    return out;
  }
  function sectionGroup(text) {
    const n = normalize(text);
    if (/教育|学历|education/.test(n)) return 'education';
    if (/家庭|亲属|家属/.test(n)) return 'family';
    if (/资格证|证书|certificate/.test(n)) return 'certificates';
    if (/取得成果|科研成果|专利成果|achievement/.test(n)) return 'achievements';
    if (/奖惩|奖励|获奖|award/.test(n)) return 'awards';
    if (/项目|project/.test(n)) return 'projects';
    if (/校园|社团|志愿|实践|campus/.test(n)) return 'campus';
    if (/工作经历|实习经历|工作经验|employment|workexperience/.test(n)) return 'work';
    if (/基本|个人信息|联系方式|personal|contact/.test(n)) return 'basic';
    return '';
  }
  function blocked(field) {
    const labels = `${field.label} ${field.name} ${field.id} ${field.autocomplete} ${field.section}`;
    return /password|passwd|密码|验证码|短信码|动态码|captcha|verification.?code|otp|one-time-code|推荐人|银行卡|银行账号|信用卡|银行账户|cvv|card.?number/i.test(labels);
  }
  function infer(field, profile, preferred = {}) {
    if (blocked(field) || field.unsupported) return { path: '', confidence: 'none', reason: field.unsupported || '该字段需要手动处理' };
    const label = normalize(field.label);
    const hint = normalize(`${field.name || ''} ${field.id || ''}`);
    const section = sectionGroup(field.section);
    const all = entries(profile).filter(e => e.index === (Number(preferred[e.group]) || 0));
    const scored = all.map(e => {
      if (['certificates', 'family', 'achievements', 'awards'].includes(section) && e.group !== section) return { e, score: 0 };
      if (section === 'family' && e.group !== 'family') return { e, score: 0 };
      if (e.group === 'family' && section !== 'family' && !/家庭成员|亲属/.test(field.label || '')) return { e, score: 0 };
      let score = 0;
      for (const alias of e.aliases) {
        const a = normalize(alias);
        if (label === a) score = Math.max(score, 100);
        else if (a.length >= 3 && label.includes(a)) score = Math.max(score, 78);
        if (hint === a) score = Math.max(score, 80);
      }
      if (e.autocomplete?.includes(field.autocomplete)) score = Math.max(score, 110);
      if (!score) return { e, score: 0 };
      if (section && section === e.group) score += 25;
      else if (section && e.group !== 'text') score -= 55;
      return { e, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    if (!scored.length || scored[0].score < 70) return { path: '', confidence: 'none', reason: '未找到可靠对应，请选择资料字段' };
    if (scored[1] && scored[0].score - scored[1].score < 15) return { path: '', confidence: 'low', reason: '多个资料字段可能对应，请手动选择' };
    const winner = scored[0].e;
    return { path: winner.path, confidence: winner.sensitive ? 'low' : scored[0].score >= 100 ? 'high' : 'medium', reason: winner.sensitive ? '敏感信息，需单独勾选' : !winner.value ? '资料为空，先补充资料' : scored[0].score >= 100 ? '字段名称匹配' : '可能匹配，请核对' };
  }
  const enumAliases = {
    '男': ['男', '男性', 'male', 'm'], '女': ['女', '女性', 'female', 'f'],
    '本科': ['本科', '大学本科', '本科生'], '硕士': ['硕士', '硕士研究生'], '博士': ['博士', '博士研究生'],
    '是': ['是', '有', 'yes'], '否': ['否', '无', 'no'],
    '英语四级': ['英语四级', '大学英语四级', 'cet4', 'cet-4', '四级'],
    '全日制': ['全日制', '普通全日制']
  };
  function optionFor(value, options) {
    const target = normalize(value);
    const candidates = new Set((enumAliases[value] || [value]).map(normalize));
    const matches = options.filter(o => !o.disabled && o.value !== '' && (normalize(o.label) === target || normalize(o.value) === target || candidates.has(normalize(o.label))));
    return matches.length === 1 ? matches[0].value : null;
  }
  function prepare(value, field, dateStyle = 'dash') {
    if (blocked(field) || field.unsupported) return { ok: false, reason: field.unsupported || '需要手动处理' };
    if (!value) return { ok: false, reason: '资料为空' };
    let result = String(value);
    const dateMatch = result.match(/^(\d{4})[-.\/](\d{1,2})(?:[-.\/](\d{1,2}))?$/);
    if (field.type === 'date' || field.type === 'month' || field.isDate) {
      if (!dateMatch) return { ok: false, reason: '需要明确日期，不能自动填写“至今”等文本' };
      const [, y, m, d] = dateMatch;
      const year = Number(y), month = Number(m), day = Number(d);
      if (month < 1 || month > 12 || (d && (day < 1 || day > new Date(year, month, 0).getDate()))) return { ok: false, reason: '日期无效' };
      if (field.type === 'date' && !d) return { ok: false, reason: '该控件要求具体日期，资料只有年月，请补充' };
      const delimiter = field.type === 'date' || field.type === 'month' ? '-' : dateStyle === 'dot' ? '.' : dateStyle === 'slash' ? '/' : '-';
      result = `${y}${delimiter}${m.padStart(2, '0')}${field.type !== 'month' && d ? delimiter + d.padStart(2, '0') : ''}`;
    }
    if (field.type === 'select' || field.type === 'radio') {
      const option = optionFor(result, field.options || []);
      if (option === null) return { ok: false, reason: '找不到唯一对应的选项，请在网页手动选择' };
      result = option;
    }
    if (field.maxLength > 0 && result.length > field.maxLength) return { ok: false, reason: `内容 ${result.length} 字符，超出 ${field.maxLength} 字符限制；请先精简` };
    return { ok: true, value: result };
  }
  function fingerprint(field) {
    return JSON.stringify([field.documentKey || '', field.id || '', field.name || '', field.label || '', field.section || '', field.type, field.ordinal || 0, (field.options || []).map(o => [o.label, o.value])]);
  }
  const api = { groups, emptyProfile, blankRecord, validateProfile, normalize, entries, sectionGroup, blocked, infer, optionFor, prepare, fingerprint };
  root.ApplicationSchema = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(globalThis);
