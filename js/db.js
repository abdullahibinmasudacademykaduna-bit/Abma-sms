/* =========================================================
   Greenwood SMS — Data layer
   Everything here is client-side (localStorage) so the whole
   app runs with zero backend. The API shape (get/add/update/
   remove, all async-friendly) mirrors what a Firestore-backed
   layer would look like, so swapping in real Firebase later
   only means rewriting this file.
   ========================================================= */

const DB_KEY = 'greenwood_sms_v4';

const DB = (function(){
  let state = null;

  function uid(prefix){
    return (prefix ? prefix + '_' : '') + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-4);
  }

  function load(){
    try{
      const raw = localStorage.getItem(DB_KEY);
      if(raw) { state = JSON.parse(raw); return; }
    }catch(e){ console.warn('DB load failed, reseeding', e); }
    state = seed();
    save();
  }

  function save(){
    localStorage.setItem(DB_KEY, JSON.stringify(state));
  }

  function collection(name){
    if(!state[name]) state[name] = [];
    return state[name];
  }

  function all(name){ return collection(name).slice(); }

  function get(name, id){ return collection(name).find(r => r.id === id) || null; }

  function add(name, record){
    record.id = record.id || uid(name.slice(0,3));
    record.createdAt = record.createdAt || new Date().toISOString();
    collection(name).push(record);
    save();
    return record;
  }

  function update(name, id, patch){
    const rec = get(name, id);
    if(!rec) return null;
    Object.assign(rec, patch, {updatedAt:new Date().toISOString()});
    save();
    return rec;
  }

  function remove(name, id){
    const arr = collection(name);
    const idx = arr.findIndex(r=>r.id===id);
    if(idx>-1){ arr.splice(idx,1); save(); return true; }
    return false;
  }

  function count(name){ return collection(name).length; }

  function settings(){ return state.settings || {}; }

  function updateSettings(patch){
    state.settings = Object.assign({}, state.settings, patch);
    save();
    return state.settings;
  }

  function reset(){ state = seed(); save(); }

  function exportJSON(){ return JSON.stringify(state, null, 2); }

  function importJSON(json){
    const parsed = JSON.parse(json);
    state = parsed;
    save();
  }

  // ---------------- seed data ----------------
  function seed(){
    const CLASS_LIST = ['Pre-Nursery','Nursery 1','Nursery 2','Nursery 3','Primary 1','Primary 2','Primary 3','Primary 4','Primary 5','Primary 6'];
    const NURSERY_SUBJ = ['Numeracy','Literacy','Basic Science','Social Habits','Rhymes & Phonics','Drawing & Colouring','Physical & Health Education'];
    const PRIMARY_SUBJ = ['Mathematics','English Language','Basic Science & Technology','Social Studies','Agricultural Science','Home Economics','Religious Studies','Civic Education','Computer Studies (ICT)'];
    const isNursery = c => !c.startsWith('Primary');
    const subjectsFor = c => isNursery(c) ? NURSERY_SUBJ : PRIMARY_SUBJ;

    const firstNamesM = ['Liam','Noah','Kwame','Kojo','Kofi','Yaw','Kwabena','Samuel','Daniel','Emmanuel','Michael','David','Joseph','Isaac','Caleb'];
    const firstNamesF = ['Ama','Akosua','Efua','Abena','Adjoa','Grace','Comfort','Gifty','Rebecca','Esther','Mary','Faith','Joyce','Linda','Patience'];
    const lastNames = ['Owusu','Mensah','Boateng','Asante','Ansah','Danso','Frimpong','Tetteh','Adjei','Appiah','Ofori','Sarpong','Bediako','Amoah','Darko'];

    function pick(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
    function rand(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }
    // Demo salary ledger: June is settled for everyone, July is a coin
    // flip so the new "Mark paid" flow in the ledger has something to do.
    function demoSalaryPayments(){
      const payments = {'2026-06':{paid:true, paidDate:'2026-06-01'}};
      if(Math.random()>0.3) payments['2026-07'] = {paid:true, paidDate:'2026-07-01'};
      return payments;
    }

    const students = [];
    CLASS_LIST.forEach((cls, ci)=>{
      const classSize = isNursery(cls) ? rand(12,18) : rand(20,30);
      for(let i=0;i<classSize;i++){
        const isM = Math.random()>0.5;
        const fn = isM?pick(firstNamesM):pick(firstNamesF);
        const ln = pick(lastNames);
        students.push({
          id: uid('stu'),
          admissionNo: 'GW' + (2400 + ci*40 + i),
          name: `${fn} ${ln}`,
          gender: isM?'Male':'Female',
          class: cls,
          dob: `20${rand(9,23)}-${String(rand(1,12)).padStart(2,'0')}-${String(rand(1,28)).padStart(2,'0')}`,
          guardian: `${pick(lastNames)} Family`,
          phone: `0${rand(20,55)}${rand(1000000,9999999)}`,
          email: `${fn.toLowerCase()}.${ln.toLowerCase()}@student.greenwood.edu`,
          address: `${rand(1,200)} ${pick(['Palm','Cedar','Acacia','Baobab','Mango'])} Street`,
          status: Math.random()>0.06 ? 'Active' : 'Inactive',
          bloodGroup: pick(['O+','A+','B+','AB+','O-','A-']),
          feeStatus: pick(['Paid','Pending','Partial']),
          createdAt: new Date().toISOString()
        });
      }
    });

    const qualifications = ['NNEB','Cert. in Early Childhood Ed.','B.Ed','Dip. Basic Education','B.A Education'];
    const teachers = [];
    // One class teacher per class (nursery classes also get a co-teacher).
    CLASS_LIST.forEach((cls)=>{
      const isM = Math.random()>0.5;
      const fn = isM?pick(firstNamesM):pick(firstNamesF);
      const ln = pick(lastNames);
      teachers.push({
        id: uid('tch'), staffNo: 'GWT'+(100+teachers.length),
        name: `${fn} ${ln}`, gender: isM?'Male':'Female',
        qualification: pick(qualifications),
        phone: `0${rand(20,55)}${rand(1000000,9999999)}`,
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}@greenwood.edu`,
        joined: `20${rand(18,24)}-0${rand(1,9)}-1${rand(0,9)}`,
        status: 'Active', classes:[cls],
        salary: rand(11,19)*100, salaryPayments: demoSalaryPayments(),
        createdAt: new Date().toISOString()
      });
      if(isNursery(cls)){
        const isM2 = Math.random()>0.5;
        const fn2 = isM2?pick(firstNamesM):pick(firstNamesF);
        const ln2 = pick(lastNames);
        teachers.push({
          id: uid('tch'), staffNo: 'GWT'+(100+teachers.length),
          name: `${fn2} ${ln2}`, gender: isM2?'Male':'Female',
          qualification: pick(qualifications),
          phone: `0${rand(20,55)}${rand(1000000,9999999)}`,
          email: `${fn2.toLowerCase()}.${ln2.toLowerCase()}@greenwood.edu`,
          joined: `20${rand(18,24)}-0${rand(1,9)}-1${rand(0,9)}`,
          status: 'Active', classes:[cls],
          salary: rand(11,19)*100, salaryPayments: demoSalaryPayments(),
          createdAt: new Date().toISOString()
        });
      }
    });
    // One subject specialist teaching ICT across all Primary classes.
    teachers.push({
      id: uid('tch'), staffNo: 'GWT'+(100+teachers.length),
      name:'Mr. Solomon Adjei', gender:'Male', qualification:'B.Sc Computer Science',
      phone:`0${rand(20,55)}${rand(1000000,9999999)}`, email:'solomon.adjei@greenwood.edu',
      joined:'2022-09-01', status:'Active',
      classes: CLASS_LIST.filter(c=>!isNursery(c)),
      salary: 1800, salaryPayments: {'2026-06':{paid:true,paidDate:'2026-06-01'}, '2026-07':{paid:true,paidDate:'2026-07-01'}},
      createdAt: new Date().toISOString()
    });

    const staff = [];
    const staffRoles = ['Accountant','Groundskeeper','Nurse','Security','Receptionist','Cook','Cleaner'];
    for(let i=0;i<10;i++){
      const isM = Math.random()>0.5;
      const fn = isM?pick(firstNamesM):pick(firstNamesF);
      const ln = pick(lastNames);
      staff.push({
        id: uid('stf'), staffNo: 'GWS'+(200+i),
        name: `${fn} ${ln}`, role: pick(staffRoles),
        department: pick(['Administration','Finance','Facilities','Health','Operations']),
        phone: `0${rand(20,55)}${rand(1000000,9999999)}`,
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}@greenwood.edu`,
        status: 'Active',
        salary: rand(6,14)*100, salaryPayments: demoSalaryPayments(),
        createdAt: new Date().toISOString()
      });
    }

    const classesData = CLASS_LIST.map(c=>({ id: uid('cls'), name:c, capacity: isNursery(c)?20:35 }));

    const subjectsData = [
      ...NURSERY_SUBJ.map(s=>({id:uid('sub'), name:s, code:s.slice(0,3).toUpperCase()+rand(100,199), level:'nursery'})),
      ...PRIMARY_SUBJ.map(s=>({id:uid('sub'), name:s, code:s.slice(0,3).toUpperCase()+rand(100,199), level:'primary'})),
    ];

    // Attendance: 14-day school-wide aggregate for the trend chart,
    // plus today's per-student records (accumulates day-over-day with real use).
    const attendance = [];
    for(let d=13; d>=0; d--){
      const date = new Date(); date.setDate(date.getDate()-d);
      const iso = date.toISOString().slice(0,10);
      const total = students.length;
      const present = Math.round(total * (0.86 + Math.random()*0.11));
      attendance.push({id: uid('att'), date: iso, present, absent: total-present, total});
    }
    const attendanceRecords = [];
    const today = new Date().toISOString().slice(0,10);
    students.forEach(s=>{
      attendanceRecords.push({
        id: uid('arec'), studentId: s.id, class: s.class, date: today,
        status: Math.random()>0.09 ? 'Present' : (Math.random()>0.5?'Absent':'Late')
      });
    });

    const exams = [
      {id: uid('exm'), name:'Mid-Term Examination', term:'Term 2', session:'2025/2026', startDate:'2026-08-10', endDate:'2026-08-14', status:'Scheduled'},
      {id: uid('exm'), name:'End of Term Examination', term:'Term 2', session:'2025/2026', startDate:'2026-09-21', endDate:'2026-09-30', status:'Scheduled'},
      {id: uid('exm'), name:'First Term Examination', term:'Term 1', session:'2025/2026', startDate:'2026-03-10', endDate:'2026-03-14', status:'Completed'},
    ];

    const gradingScale = [
      {min:80, max:100, grade:'A', remark:'Excellent'},
      {min:70, max:79,  grade:'B', remark:'Very Good'},
      {min:60, max:69,  grade:'C', remark:'Good'},
      {min:50, max:59,  grade:'D', remark:'Pass'},
      {min:0,  max:49,  grade:'F', remark:'Fail'},
    ];
    function gradeOf(total){ return gradingScale.find(b=>total>=b.min && total<=b.max) || gradingScale[gradingScale.length-1]; }
    const AFFECTIVE = ['Punctuality','Neatness','Politeness','Honesty','Cooperation','Attentiveness'];
    const PSYCHOMOTOR = ['Handwriting','Games & Sports','Drawing & Painting','Craft Work','Verbal Fluency'];

    const results = [];
    const completedExam = exams[2];
    students.slice(0, 60).forEach(s=>{
      const subs = subjectsFor(s.class);
      const subjectRows = subs.map(name=>{
        const ca1 = rand(10,20), ca2 = rand(10,20), exam = rand(25,60);
        const total = ca1+ca2+exam;
        const band = gradeOf(total);
        return {name, ca1, ca2, exam, total, grade: band.grade, remark: band.remark};
      });
      const overallTotal = subjectRows.reduce((a,r)=>a+r.total,0);
      const avg = Math.round(overallTotal/subjectRows.length);
      const behavioural = {};
      [...AFFECTIVE, ...PSYCHOMOTOR].forEach(t=> behavioural[t] = rand(3,5));
      results.push({
        id: uid('res'), studentId: s.id, examId: completedExam.id,
        subjects: subjectRows, overallTotal, behavioural,
        remarkClass: avg>=80?'An outstanding performance this term. Keep up the excellent work and continue striving for the very best.' : avg>=70?'A very good result this term. Your consistent effort is clearly paying off — keep it up.' : avg>=60?'A good result this term. There is still room to improve with more consistent practice.' : 'A fair result this term. More effort and regular revision are needed to see stronger improvement next term.',
        remarkHead: avg>=80?'An outstanding academic performance. Well done — this standard of work is commendable and should be sustained.' : avg>=70?'A very good result. Consistent effort is evident; continued encouragement will help push this further.' : avg>=60?'A good result. Steady progress is being made; more consistent practice at home would help.' : 'A fair result this term. Additional encouragement and closer monitoring of homework are recommended.',
        nextTermBegin:'2026-09-14', nextTermFee: rand(1100,1900),
        session:'2025/2026', savedAt: new Date().toISOString()
      });
    });

    // Billing catalog: what a student can be charged for and how much
    // each item costs. Editable from Fees & Finance → Billing Items.
    const feeItems = [
      {id: uid('fit'), name:'School Fee', price: 1200},
      {id: uid('fit'), name:'Feeding', price: 300},
      {id: uid('fit'), name:'Transport Levy', price: 150},
      {id: uid('fit'), name:'PTA Dues', price: 50},
      {id: uid('fit'), name:'Textbooks', price: 200},
      {id: uid('fit'), name:'Uniform', price: 100},
    ];

    const FEE_CATEGORIES = ['Tuition','Feeding','PTA Dues'];
    const fees = students.map(s=>{
      const tuition = isNursery(s.class) ? rand(900,1300) : rand(1100,1600);
      const feeding = rand(200,350);
      const ptaDues = 50;
      const amount = tuition+feeding+ptaDues;
      const status = s.feeStatus;
      const paid = status==='Paid'?amount : status==='Partial'? Math.round(amount*0.5) : 0;
      return {
        id: uid('fee'), studentId:s.id, term:'Term 2',
        items:[{category:'Tuition',amount:tuition},{category:'Feeding',amount:feeding},{category:'PTA Dues',amount:ptaDues}],
        amount, paid, balance: amount-paid, status, dueDate:'2026-08-01'
      };
    });

    const library = [];
    const bookTitles = ['Alphabet Picture Book','My First Numbers','English Grammar Basics','Fun with Phonics','Junior Atlas','Basic Science for Kids','Bible Stories for Children','Craft Ideas for Little Hands','Primary Mathematics Workbook','Story Time Anthology','Colours & Shapes','Nursery Rhymes Collection'];
    bookTitles.forEach(t=>{
      library.push({id:uid('bk'), title:t, author: pick(lastNames)+' & Co', isbn:'978-'+rand(100,999)+'-'+rand(1000,9999), copies: rand(3,12), available: rand(1,10), category: pick(['Reading','Numeracy','Reference','Story Books','Craft'])});
    });
    const libraryLoans = [];
    for(let i=0;i<8;i++){
      const s = pick(students);
      const b = pick(library);
      libraryLoans.push({id:uid('loan'), studentId:s.id, bookId:b.id, issueDate:'2026-07-0'+rand(1,9), dueDate:'2026-07-2'+rand(0,9), returned: Math.random()>0.6});
    }

    const NURSERY_ACTIVITIES = ['Circle Time','Numeracy Time','Literacy Time','Rhymes & Phonics','Story Time','Snack Break','Outdoor Play','Drawing & Colouring','Music & Movement','Nap Time'];
    const days = ['Mon','Tue','Wed','Thu','Fri'];
    const periods = ['8:00-8:45','8:45-9:30','9:30-10:15','10:35-11:20','11:20-12:05','12:45-13:30'];
    const timetable = [];
    CLASS_LIST.forEach(cls=>{
      const pool = isNursery(cls) ? NURSERY_ACTIVITIES : subjectsFor(cls);
      const classTeachers = teachers.filter(t=>t.classes.includes(cls));
      days.forEach(day=>{
        periods.forEach(p=>{
          if(Math.random()>0.15){
            timetable.push({id:uid('tt'), class:cls, day, period:p, subject: pick(pool), teacher: (pick(classTeachers)||pick(teachers)).name});
          }
        });
      });
    });

    const notices = [
      {id:uid('not'), title:'Mid-Term Break Announcement', body:'School will be closed for mid-term break from Aug 3–7. Classes resume Aug 8.', audience:'All', date:'2026-07-18', pinned:true},
      {id:uid('not'), title:'PTA Meeting — Term 2', body:'Parent-Teacher meeting scheduled for the last Saturday of the month in the main hall.', audience:'Parents', date:'2026-07-15', pinned:true},
      {id:uid('not'), title:'New Library Books Arrived', body:'The library has received a new set of reading and numeracy books for the term.', audience:'All', date:'2026-07-05', pinned:false},
    ];

    const activities = [
      {id:uid('act'), text:'New student admitted to Primary 2', type:'student', time:'10 min ago', read:false},
      {id:uid('act'), text:'Fee payment received', type:'fee', time:'34 min ago', read:false},
      {id:uid('act'), text:'Attendance marked for Nursery 1', type:'attendance', time:'1 hr ago', read:false},
      {id:uid('act'), text:'New notice published: PTA Meeting', type:'notice', time:'3 hr ago', read:true},
      {id:uid('act'), text:'Exam schedule updated for Term 2', type:'exam', time:'5 hr ago', read:true},
      {id:uid('act'), text:'Library book returned by student', type:'library', time:'Yesterday', read:true},
    ];

    const events = [
      {id:uid('evt'), title:'PTA Meeting', date:'2026-07-25', category:'Meeting'},
      {id:uid('evt'), title:'Mid-Term Break', date:'2026-08-03', category:'Holiday'},
      {id:uid('evt'), title:'Nursery Sports Day', date:'2026-08-15', category:'Sports'},
      {id:uid('evt'), title:'Founders Day', date:'2026-09-02', category:'Celebration'},
    ];

    const inventory = [
      {id:uid('inv'), item:'Whiteboard Markers', category:'Stationery', quantity:180, reorderLevel:50, unit:'pcs'},
      {id:uid('inv'), item:'Learning Tablets', category:'Electronics', quantity:10, reorderLevel:3, unit:'units'},
      {id:uid('inv'), item:'Exercise Books', category:'Stationery', quantity:900, reorderLevel:200, unit:'pcs'},
      {id:uid('inv'), item:'Building Blocks Sets', category:'Toys & Learning Aids', quantity:15, reorderLevel:4, unit:'sets'},
      {id:uid('inv'), item:'First Aid Kits', category:'Health', quantity:10, reorderLevel:4, unit:'kits'},
    ];

    const expenditures = [
      {id:uid('exp'), item:'Whiteboard Markers (bulk restock)', category:'Stationery', quantity:60, unitCost:2, amount:120, vendor:'Kaduna Office Supplies', purchaseDate:'2026-07-02', purchasedBy:'Accounts Office', notes:'Restock for all classrooms.'},
      {id:uid('exp'), item:'Learning Tablets', category:'Electronics', quantity:5, unitCost:180, amount:900, vendor:'TechHub Nigeria', purchaseDate:'2026-06-18', purchasedBy:'Super Admin', notes:'For Primary 5 & 6 ICT lessons.'},
      {id:uid('exp'), item:'Plumbing repair — staff toilets', category:'Maintenance & Repairs', quantity:1, unitCost:340, amount:340, vendor:'Danjuma Plumbing Services', purchaseDate:'2026-06-25', purchasedBy:'Facilities', notes:''},
      {id:uid('exp'), item:'Exercise Books (carton)', category:'Stationery', quantity:20, unitCost:45, amount:900, vendor:'Greenwood Book Depot', purchaseDate:'2026-07-05', purchasedBy:'Accounts Office', notes:''},
      {id:uid('exp'), item:'Electricity bill — July', category:'Utilities', quantity:1, unitCost:610, amount:610, vendor:'State Power Distribution Co.', purchaseDate:'2026-07-10', purchasedBy:'Accounts Office', notes:''},
      {id:uid('exp'), item:'Building Blocks Sets', category:'Learning Materials', quantity:8, unitCost:35, amount:280, vendor:'Little Learners Supplies', purchaseDate:'2026-06-30', purchasedBy:'Head Teacher', notes:'Nursery play corner.'},
      {id:uid('exp'), item:'First Aid restock', category:'Health', quantity:10, unitCost:18, amount:180, vendor:'MedCare Pharmacy', purchaseDate:'2026-07-08', purchasedBy:'Nurse', notes:''},
      {id:uid('exp'), item:'School bus service & tyres', category:'Transport', quantity:1, unitCost:520, amount:520, vendor:'Ansah Auto Works', purchaseDate:'2026-06-20', purchasedBy:'Facilities', notes:''},
    ];

    const health = students.slice(0,15).map(s=>({
      id:uid('hea'), studentId:s.id, condition: pick(['None','Asthma','Allergy - Peanuts','Seasonal Allergy','None','None']),
      lastCheckup:'2026-0'+rand(1,6)+'-1'+rand(0,9), notes:'Routine checkup — no concerns.'
    }));

    const assignments = [
      {id:uid('asg'), title:'Numbers 1-10 Worksheet', class:'Nursery 2', subject:'Numeracy', dueDate:'2026-07-24', status:'Open'},
      {id:uid('asg'), title:'Colouring: My Family', class:'Nursery 1', subject:'Drawing & Colouring', dueDate:'2026-07-23', status:'Open'},
      {id:uid('asg'), title:'Mathematics Worksheet Ch.4', class:'Primary 3', subject:'Mathematics', dueDate:'2026-07-24', status:'Open'},
      {id:uid('asg'), title:'Essay: My Community', class:'Primary 5', subject:'English Language', dueDate:'2026-07-22', status:'Open'},
      {id:uid('asg'), title:'Science Project', class:'Primary 6', subject:'Basic Science & Technology', dueDate:'2026-07-20', status:'Closed'},
    ];

    const communications = [
      {id:uid('com'), channel:'SMS', audience:'All Parents', message:'Reminder: PTA meeting this Saturday at 10 AM.', sentAt:'2026-07-18', status:'Delivered'},
      {id:uid('com'), channel:'Email', audience:'All Parents', message:'Mid-term results are now available on the parent portal.', sentAt:'2026-07-12', status:'Delivered'},
    ];

    // Class teachers get their user account linked to their teacher record;
    // one primary class teacher is the demo "Teacher" login so class-scoping
    // is easy to see: they should only ever see their own class.
    const demoTeacher = teachers.find(t=>t.classes[0]==='Primary 3');
    const demoStudent = students.find(s=>s.class==='Primary 3') || students[0];
    const demoAccountantStaff = staff.find(s=>s.role==='Accountant');

    const users = [
      {id:uid('usr'), name:'Abena Owusu', role:'Super Admin', email:'admin@greenwood.edu', status:'Active'},
      {id:uid('usr'), name:'Mr. Kwame Ansah', role:'Principal', email:'principal@greenwood.edu', status:'Active'},
      {id:uid('usr'), name:'Mrs. Efua Danso', role:'Head Teacher', email:'headteacher@greenwood.edu', status:'Active'},
      {id:uid('usr'), name: demoTeacher.name, role:'Teacher', email:'teacher@greenwood.edu', status:'Active', linkedTeacherId: demoTeacher.id},
      {id:uid('usr'), name: demoAccountantStaff ? demoAccountantStaff.name : 'Mr. Kojo Asante', role:'Accountant', email:'accountant@greenwood.edu', status:'Active', linkedStaffId: demoAccountantStaff ? demoAccountantStaff.id : ''},
      {id:uid('usr'), name:'Mrs. Grace Owusu', role:'Parent', email:'parent@greenwood.edu', status:'Active', linkedStudentId: demoStudent.id},
      {id:uid('usr'), name: demoStudent.name, role:'Student', email:'student@greenwood.edu', status:'Active', linkedStudentId: demoStudent.id},
    ];

    return {
      students, teachers, staff, classes: classesData, subjects: subjectsData,
      attendance, attendanceRecords, exams, results, fees, feeItems,
      library, libraryLoans, timetable, notices, activities, events,
      inventory, health, assignments, communications, users, expenditures,
      settings: {
        schoolName:'Your School Name',
        motto:'Your school motto goes here',
        address:'School address, city',
        phone:'+233 000 000 000',
        email:'info@yourschool.edu',
        term:'Term 2, 2025/2026',
        session:'2025/2026',
        theme:'light',
        currency:'GHS',
        logoDataUrl:'',
        gradingScale,
      }
    };
  }

  load();

  return { all, get, add, update, remove, count, save, reset, exportJSON, importJSON, uid, collection, settings, updateSettings };
})();
