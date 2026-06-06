// One realistic example description per professional domain.
// Keys must match exactly the domain values in DOMAIN_GROUPS (StepPersonal) and DOMAIN_MAP (CVBuilderClient).

const DOMAIN_PLACEHOLDERS: Record<string, string> = {
  // ── Default (no domain selected) ──────────────────────────────────────────
  '': `Example: "I'm a project manager with 8 years of experience. I led cross-functional teams at Airbus for 4 years managing €10M budgets, then joined a tech startup as Head of Operations. I studied Business Administration at HEC Paris. I'm fluent in French, English and Spanish. Looking for a senior management role in France or Canada."`,

  // ── HEALTH & MEDICAL ──────────────────────────────────────────────────────
  'General Medicine': `Example: "I'm a general practitioner with 10 years of experience. I ran my own practice in Lyon for 5 years after working 3 years at the Saint-Antoine Hospital in Paris. I treat 25–30 patients daily and specialize in chronic disease management and preventive care. I'm looking for a hospital position in the Paris region."`,

  'Cardiology': `Example: "I'm an interventional cardiologist with 9 years of post-residency experience at the Pitié-Salpêtrière Hospital in Paris. I perform coronary angioplasties and device implantations, and have published 12 research papers. I'm now seeking a senior cardiology position at a university hospital."`,

  'Neurology': `Example: "I'm a neurologist specializing in epilepsy and movement disorders with 7 years of experience. I completed my residency at the CHU de Lyon and have been working at a private neurological clinic. I perform EEGs and manage 200+ patients monthly. Looking for a hospital role in France."`,

  'Dentistry': `Example: "I'm a dentist with 8 years of practice running my own dental office in Lyon. I specialize in cosmetic dentistry, implants, and orthodontics. I've treated over 2,000 patients and completed advanced training in oral surgery. Seeking an associate dentist role in a group practice."`,

  'Ophthalmology': `Example: "I'm an ophthalmologist with 6 years of clinical experience at the Quinze-Vingts National Eye Hospital. I specialize in cataract surgery, retinal disorders, and laser refractive surgery, performing over 300 procedures annually. Seeking a senior role at a private ophthalmology center."`,

  'Gynaecology': `Example: "I'm an OB-GYN with 11 years of experience combining hospital work and private practice. I've delivered over 500 babies and specialize in high-risk pregnancies and minimally invasive gynecological surgery. Looking for a position at a maternity hospital in the south of France."`,

  'Paediatrics': `Example: "I'm a pediatrician with 8 years of experience at a children's hospital. I specialize in neonatology and developmental pediatrics, managing cases from premature newborns to adolescents. I'm bilingual in French and English and seeking an opportunity in a pediatric department."`,

  'Orthopaedics': `Example: "I'm an orthopedic surgeon with 12 years of experience specializing in sports medicine and joint replacement. I've performed over 1,000 knee and hip replacement surgeries at the CHU de Grenoble. Seeking a senior consulting surgeon position at a private clinic."`,

  'Pulmonology': `Example: "I'm a pulmonologist with 7 years of experience treating asthma, COPD, and sleep apnea. I worked at the Hôpital Lariboisière before setting up a private practice. I'm certified in bronchoscopy and sleep medicine. Looking for a mixed hospital and private position."`,

  'Medical Biology': `Example: "I'm a medical biologist with 9 years managing clinical laboratory operations. I oversaw a team of 15 technicians at a major Paris hospital, implementing quality management systems and reducing turnaround times by 25%. Looking for a lab director role."`,

  'Pharmacy': `Example: "I'm a pharmacist with 7 years in community pharmacy. I managed a team of 5 and counseled 80+ patients daily. I'm specialized in oncology pharmacy and clinical pharmacy. Seeking an opportunity in a hospital pharmacy or pharmaceutical company in France."`,

  'General Surgery': `Example: "I'm a general surgeon with 14 years of experience specializing in laparoscopic and robotic surgery. I've performed over 2,000 procedures including cholecystectomies and hernia repairs at the CHU de Toulouse. Seeking a department head role in a major hospital."`,

  'Nursing & Care': `Example: "I'm a registered nurse with 6 years of experience in intensive care at the CHU de Bordeaux. I managed critically ill patients, administered medications, and coordinated with multidisciplinary teams. I hold a specialty certification in critical care. Looking for an ICU position in the Île-de-France region."`,

  'Physiotherapy': `Example: "I'm a physiotherapist with 5 years of experience in sports rehabilitation and post-surgical recovery. I worked at a sports medicine clinic treating professional athletes and at a rehabilitation center for post-stroke patients. I'm certified in manual therapy. Seeking a role in a sports clinic."`,

  'Psychiatry': `Example: "I'm a psychiatrist with 10 years of experience in adult mental health at the Sainte-Anne Hospital in Paris. I now run a private practice specializing in mood disorders and anxiety, seeing 15–20 patients weekly. Looking for a hospital or clinic position in Paris."`,

  'Radiology': `Example: "I'm a radiologist with 8 years of experience in diagnostic imaging at the Hôpital Necker, interpreting CT scans, MRIs, and ultrasounds. I specialize in oncological radiology and interventional procedures, reading 40+ cases daily. Seeking a senior radiologist role."`,

  'Emergency & ICU': `Example: "I'm an emergency medicine physician with 9 years of experience in busy urban ERs in Paris and Marseille, handling 60+ patients per shift. I'm ACLS and ATLS certified and specialize in trauma management. Looking for a senior ER physician role."`,

  'Geriatrics': `Example: "I'm a geriatrician with 7 years of experience caring for elderly patients in hospital and nursing home settings. I specialize in dementia management, fall prevention, and polypharmacy reduction, coordinating care for 50+ patients weekly. Looking for a geriatric unit position."`,

  'ENT': `Example: "I'm an ENT surgeon with 8 years of experience specializing in head and neck surgery and cochlear implants. I trained at the Lariboisière Hospital and now work at a private clinic performing 200+ surgeries annually. Seeking a senior ENT position in a hospital."`,

  'Anaesthesiology': `Example: "I'm an anesthesiologist with 11 years of experience in general, regional, and obstetric anesthesia at the CHU de Montpellier. I support surgical teams across multiple specialties, managing over 1,000 cases annually. Looking for a senior anesthesiologist position."`,

  // ── TECHNOLOGY ────────────────────────────────────────────────────────────
  'Web Development': `Example: "I'm a full-stack developer with 6 years of experience. I worked at a Paris startup as lead engineer building React and Node.js applications used by 500K users. Before that I was a frontend developer at Capgemini. I'm looking for a senior or lead developer role in France or remote."`,

  'Artificial Intelligence': `Example: "I'm an AI/ML engineer with 5 years of experience in deep learning and NLP. I built recommendation systems and LLM-powered applications at a Paris AI startup. I hold a Master's in Machine Learning from Polytechnique and have published 3 papers. Seeking a research or senior ML role."`,

  'Cybersecurity': `Example: "I'm a cybersecurity engineer with 7 years of experience in penetration testing and incident response. I worked at a major French bank protecting critical infrastructure and led a team of 6 security analysts. I hold CISSP and CEH certifications. Looking for a CISO or senior security role."`,

  'Cloud / DevOps': `Example: "I'm a DevOps engineer with 5 years of experience with AWS, Kubernetes, and CI/CD pipelines. I reduced deployment times by 60% and built infrastructure supporting 10M monthly users at my current company. I'm certified AWS Solutions Architect. Seeking a senior DevOps or platform engineering role."`,

  'Data Science': `Example: "I'm a data scientist with 4 years of experience in predictive modeling and data visualization. I worked at BNP Paribas building fraud detection models that saved €2M annually. Proficient in Python, R, SQL, and TensorFlow. Looking for a senior data scientist role in finance or tech."`,

  'Game Development': `Example: "I'm a game developer with 5 years of experience in Unity and Unreal Engine. I shipped 3 mobile games with 500K+ combined downloads and worked at Ubisoft as a gameplay programmer for 2 years. I specialize in procedural generation. Seeking a mid-to-senior developer role at a game studio."`,

  'UI / UX Design': `Example: "I'm a UI/UX designer with 6 years of experience designing digital products for fintech and healthcare startups. I led a banking app redesign that increased user retention by 35%. Expert in Figma and user research. Seeking a lead designer or design system role in a product company."`,

  'Systems Administration': `Example: "I'm a systems administrator with 8 years of experience managing Linux and Windows server environments for a 500-employee company. I led a migration to Azure and maintained 99.9% uptime. I hold RHCE and MCSA certifications. Looking for a senior sysadmin or infrastructure manager role."`,

  'Technical Support': `Example: "I'm an IT support specialist with 4 years of experience providing L1/L2/L3 support. I managed a helpdesk team of 5 at a multinational, resolving 200+ tickets weekly and cutting resolution time by 40%. Looking for a support manager or IT coordinator role."`,

  'E-commerce': `Example: "I'm an e-commerce specialist with 6 years of experience managing online stores on Shopify and WooCommerce. I grew a fashion brand's online revenue from €500K to €3M in 3 years through SEO, email campaigns, and CRO. Looking for an e-commerce manager role in retail or fashion."`,

  // ── LAW & LEGAL ───────────────────────────────────────────────────────────
  'Lawyer / Attorney': `Example: "I'm a lawyer with 9 years of experience specializing in corporate and commercial law. I worked at a major Paris law firm advising CAC 40 companies on M&A transactions and disputes. I'm admitted to the Paris Bar and speak fluent English and Spanish. Seeking a partner-track position."`,

  'Judiciary': `Example: "I'm a magistrate with 12 years of judicial experience. I served as an investigating judge in Lyon for 6 years before being appointed to the Court of Appeal. I specialize in white-collar crime and financial fraud. Looking for opportunities in judicial administration or legal consulting."`,

  'Notary': `Example: "I'm a notary with 10 years of experience in real estate, estate planning, and family law. I run a notarial office in Bordeaux with a team of 8, handling 200+ real estate transactions annually. I specialize in cross-border estate matters. Seeking a senior notary or notarial office acquisition."`,

  'Bailiff': `Example: "I'm a bailiff with 8 years of experience in debt recovery and legal process serving. I manage a practice in Lille handling 500+ cases monthly, specializing in commercial debt recovery and eviction proceedings. Looking to expand or join a larger practice."`,

  'Business Law': `Example: "I'm a business law attorney with 11 years of experience in M&A, private equity, and corporate governance. I advised on transactions totaling over €2 billion and led a team of 4 associates at an international law firm in Paris. Seeking an in-house general counsel or senior partner role."`,

  'International Law': `Example: "I'm an international law specialist with 8 years in trade law and investment arbitration. I worked at the ICC International Court of Arbitration and a Geneva-based NGO. Fluent in French, English, Arabic, and Spanish. Seeking a role at an international organization or firm specializing in global disputes."`,

  // ── FINANCE & BUSINESS ────────────────────────────────────────────────────
  'Accounting / Audit': `Example: "I'm a certified accountant with 10 years of experience. I led audit engagements at Deloitte for 5 years then founded my own accounting firm serving 30 SME clients. I specialize in IFRS consolidation and tax optimization. Looking for a CFO or finance director position."`,

  'Banking / Finance': `Example: "I'm a corporate banker with 8 years of experience in structured finance and credit analysis at Société Générale. I managed a €500M corporate loan portfolio and hold the CFA charter. I specialize in leveraged buyouts and project finance. Seeking a senior banking or investment role."`,

  'Stock Market / Investment': `Example: "I'm a portfolio manager with 9 years of experience in asset management. I managed an €800M European equities fund at Amundi, generating 12% annual alpha. I hold the CFA designation and specialize in ESG investing. Seeking a senior PM or fund manager role."`,

  'Insurance': `Example: "I'm an insurance actuary with 7 years in life and health insurance pricing. I developed pricing models at AXA that improved profitability by 15%. I'm a Fellow of the Institut des Actuaires and proficient in R and Python. Looking for a chief actuary or pricing director role."`,

  'Consulting / Management': `Example: "I'm a management consultant with 8 years at McKinsey and my own boutique firm. I led 20+ transformation projects for Fortune 500 companies in retail and healthcare, delivering average cost savings of 18%. Seeking an in-house strategy director or partner role."`,

  'Real Estate': `Example: "I'm a real estate professional with 10 years in commercial property investment and development. I managed a €150M portfolio at a family office and developed 3 office complexes in the Paris region. Seeking a head of real estate or investment director role at a fund or developer."`,

  'Entrepreneurship': `Example: "I'm a serial entrepreneur with 12 years of founding and scaling startups. I co-founded two tech companies: one acquired by a CAC 40 group for €8M, and one currently at €2M ARR with 15 employees. I'm now seeking roles in venture capital, startup advisory, or a new co-founder opportunity."`,

  // ── ENGINEERING ───────────────────────────────────────────────────────────
  'Civil Engineering': `Example: "I'm a civil engineer with 12 years of experience in infrastructure projects. I led the construction of a €50M highway interchange near Lyon and managed teams of 20+ on bridge and tunnel projects. I hold a PMP certification. Seeking a project director role at an infrastructure company."`,

  'Electrical Engineering': `Example: "I'm an electrical engineer with 8 years of experience in power systems and industrial automation at Schneider Electric. I designed electrical installations for industrial plants, improving energy efficiency by 20% across 5 facilities. Seeking a senior electrical engineer or project manager role."`,

  'Mechanical Engineering': `Example: "I'm a mechanical engineer with 9 years in product design and manufacturing. I worked at Airbus designing structural components for the A350 and led a team of 12 engineers. Proficient in CATIA V5 and SolidWorks. Looking for a senior mechanical or R&D engineer role in aerospace."`,

  'Oil & Gas': `Example: "I'm a petroleum engineer with 11 years of experience in reservoir management and drilling at TotalEnergies. I worked on offshore projects in Angola and Norway, managing production optimization for fields producing 50,000 barrels/day. Seeking a senior reservoir or production engineering role."`,

  'Environmental Engineering': `Example: "I'm an environmental engineer with 7 years in pollution remediation and environmental impact assessment. I led 15+ compliance projects for industrial clients and reduced emissions by 30% at a major manufacturing plant. Seeking a head of HSE or environmental consulting role."`,

  'Industrial Engineering': `Example: "I'm an industrial engineer with 8 years in lean manufacturing and supply chain optimization. I implemented lean principles at a Renault plant, reducing waste by 25% and improving throughput by 18%. I hold a Six Sigma Black Belt. Looking for an operations or industrial excellence director role."`,

  'Automotive / Aerospace': `Example: "I'm an aerospace engineer with 10 years at Safran Aircraft Engines. I led the design and testing of turbine components for CFM56 engines and managed a team of 8 through a full certification cycle. Looking for a senior R&D or program manager role in aerospace or automotive."`,

  'Naval / Maritime': `Example: "I'm a naval architect with 9 years in ship design and marine engineering at Naval Group. I designed corvettes and offshore support vessels and am proficient in NAPA, AutoCAD, and finite element analysis. Looking for a senior naval architect or marine project manager role."`,

  'Chemical Engineering': `Example: "I'm a chemical engineer with 8 years of experience in process design and optimization at Air Liquide. I reduced energy consumption by 15% and improved yield by 8% across three industrial gas plants. Seeking a senior process engineer or plant manager role."`,

  'Mining / Geology': `Example: "I'm a mining geologist with 11 years in mineral exploration and mine planning at Eramet in New Caledonia and Gabon. I oversaw resource estimation for nickel and manganese deposits totaling 50M tonnes. Seeking a chief geologist or mine planning manager role."`,

  // ── EDUCATION ─────────────────────────────────────────────────────────────
  'Primary Education': `Example: "I'm a primary school teacher with 8 years of experience teaching 2nd and 3rd grade in Nantes. I developed differentiated learning programs that improved reading scores by 20%. I'm trained in Montessori methods and special needs inclusion. Looking for a position in Paris or Lyon."`,

  'Higher Education': `Example: "I'm a university professor with 15 years of experience teaching economics at Sciences Po Paris. I supervise 8 PhD students and have published 25 peer-reviewed articles. I also consult for the French Ministry of Finance. Seeking a full professorship or research director position."`,

  'Scientific Research': `Example: "I'm a research scientist with 10 years in molecular biology at INSERM. I led a team of 6 studying cancer biomarkers, published 18 articles in Nature and Science, and secured €2M in research grants. Looking for a lab director role at a research institute or biotech company."`,

  'Vocational Training': `Example: "I'm a corporate trainer with 8 years in leadership development and digital skills training. I designed and delivered programs for 500+ managers at major French companies. I'm an ICF-certified coach. Seeking a learning & development director role in a large organization."`,

  'Early Childhood': `Example: "I'm an early childhood educator with 6 years working with children aged 0–3 at a Paris crèche. I developed stimulation programs for 40 children and trained a team of 8 assistants. I hold an early childhood education degree. Looking for a nursery director position."`,

  // ── MEDIA & COMMUNICATION ─────────────────────────────────────────────────
  'Journalism': `Example: "I'm a journalist with 10 years in investigative reporting. I worked at Le Monde covering politics and finance, broke several corruption stories, and won the Prix Albert-Londres in 2019. I write in French and English. Seeking an editor or senior correspondent role at a major publication."`,

  'Film / Audiovisual': `Example: "I'm a film director and screenwriter with 8 years of experience. I directed 2 feature films screened at Cannes, 15+ luxury brand commercials, and wrote scripts for two Canal+ TV series. Looking for a creative director role at a production company or streaming platform."`,

  'Graphic Arts': `Example: "I'm a graphic designer with 7 years in branding and editorial design at a Paris advertising agency. I created visual identities for 30+ brands and led the rebranding of two CAC 40 companies. Expert in Adobe Creative Suite. Seeking a creative director or senior designer role in luxury or fashion."`,

  'Photography': `Example: "I'm a professional photographer with 9 years specializing in fashion and editorial. My work has been published in Vogue, Elle, and Le Figaro Magazine. I've shot campaigns for Chanel and Louis Vuitton. Looking for a staff photographer role at a major fashion house or magazine."`,

  'Performing Arts': `Example: "I'm a theater director and stage performer with 12 years of professional experience. I directed 8 productions at major French theaters including the Comédie-Française and toured internationally. I also teach acting at a Paris conservatoire. Seeking a resident director or artistic director role."`,

  'Music': `Example: "I'm a professional musician and composer with 10 years of experience. I played first violin with the Orchestre de Paris for 5 years and now compose film scores, having scored 6 feature films and released 2 solo albums. Seeking a composer-in-residence or music director role."`,

  'Writing / Copywriting': `Example: "I'm a copywriter and content strategist with 7 years in digital marketing. I wrote copy for 50+ brand campaigns and managed content for e-commerce sites generating €10M+ revenue. I specialize in SEO copywriting and email marketing. Seeking a head of content or brand voice lead role."`,

  'Public Relations': `Example: "I'm a PR director with 10 years in corporate communications. I managed communications for a CAC 40 company, handled 3 major crises, organized 20+ press events annually, and maintained relationships with 200+ journalists across Europe. Seeking a VP Communications role."`,

  'Marketing / Advertising': `Example: "I'm a marketing director with 9 years in digital and brand marketing. I led a team of 12 at a FMCG company, launched 5 new products, and grew market share by 8%. I specialize in performance marketing and data-driven campaigns. Seeking a CMO or marketing VP role."`,

  // ── SOCIAL & HR ───────────────────────────────────────────────────────────
  'Human Resources': `Example: "I'm an HR director with 12 years in talent management and organizational development. I led HR for a 1,500-employee company, reducing turnover by 30% and implementing a new HRIS. I hold the GPHR certification. Seeking a CHRO or HR director role at a multinational."`,

  'Social Work': `Example: "I'm a social worker with 9 years supporting vulnerable families at a child protection agency, managing 40 active cases and coordinating with schools, courts, and medical services. I specialize in child protection. Seeking a senior social worker or team leader position."`,

  'Public Service': `Example: "I'm a senior civil servant with 15 years in public administration. I served in the Ministry of Finance and at the Council of State, managing €50M budgets and leading inter-ministerial reform projects. I'm a top civil service school graduate. Seeking a senior director or agency head position."`,

  'Security / Defence': `Example: "I'm a former military officer (Lieutenant-Colonel) with 18 years of service. I led a battalion of 800 soldiers, conducted operations in Mali and Afghanistan, and specialized in strategic intelligence. Now transitioning to private security consulting or corporate risk management."`,

  'Fire & Rescue': `Example: "I'm a fire captain with 14 years in the fire service. I commanded a team of 45 firefighters, responded to 2,000+ emergency calls including major industrial fires, and hold certifications in hazmat response and urban search and rescue. Transitioning to fire safety engineering or emergency management."`,

  'Police / Law Enforcement': `Example: "I'm a police commander with 16 years in law enforcement. I led a criminal investigation unit, achieved an 85% case clearance rate, and specialized in financial crime and cybercrime. Seeking a transition to private security, compliance, or corporate investigation."`,

  // ── TRANSPORT & LOGISTICS ─────────────────────────────────────────────────
  'Aviation / Piloting': `Example: "I'm a commercial pilot with 12 years of experience and 8,000 flight hours. I hold an ATPL and am type-rated on the A320 and B737. I flew as First Officer at Air France for 5 years and as Captain at a regional airline for 4 years. Seeking a Captain position at a major airline."`,

  'Hospitality / Tourism': `Example: "I'm a hotel general manager with 15 years in luxury hospitality. I managed 5-star properties in Paris and Cannes with 200+ rooms, achieving TripAdvisor #1 rankings in both cities. I specialize in revenue management. Seeking a GM role at a luxury brand in Europe or the Middle East."`,

  'Restaurant / Culinary': `Example: "I'm a chef with 12 years of culinary experience. I trained under Alain Ducasse and earned my first Michelin star at 32 as head chef of my Lyon restaurant. I specialize in French-Mediterranean cuisine. Looking for a head chef or culinary director role at a fine dining restaurant."`,

  'Transport / Logistics': `Example: "I'm a supply chain manager with 10 years in logistics and distribution. I optimized warehouse operations for a major retailer, cutting logistics costs by €3M annually, and managed a fleet of 200 vehicles. I hold APICS CSCP certification. Seeking a supply chain director role."`,

  'Maritime / Cruise': `Example: "I'm a merchant navy captain with 20 years of sea-going experience, commanding container ships up to 15,000 TEU on trans-Atlantic and Asia-Europe routes. I hold all advanced STCW certificates. Seeking a port operations manager or maritime safety consultant role ashore."`,

  // ── AGRICULTURE & ENVIRONMENT ─────────────────────────────────────────────
  'Agriculture / Agronomy': `Example: "I'm an agronomist with 8 years in precision agriculture and crop management. I managed 500-hectare cereal farms, increasing yields by 15% through soil analysis and digital farming technology. I hold an agronomy engineering degree. Seeking a farm director or agri-tech advisor role."`,

  'Livestock / Veterinary': `Example: "I'm a veterinarian with 10 years in large animal practice and livestock health management. I ran a mixed practice in Normandy serving 50 farms, specializing in cattle reproduction and herd health. I'm certified in animal welfare assessment. Seeking a role in veterinary consultancy or agri-food inspection."`,

  'Forestry': `Example: "I'm a forestry engineer with 9 years managing sustainable forests. I managed 3,000 hectares, developed biodiversity conservation plans, and implemented FSC-certified practices. Seeking a forest manager or sustainable land management role."`,

  'Ecology': `Example: "I'm an environmental ecologist with 7 years in biodiversity assessment and conservation. I conducted impact studies for major infrastructure projects and worked with a national research institute on wetland ecosystem research. Expert in GIS mapping. Seeking a senior ecologist or environmental project manager role."`,

  // ── COMMERCE & SALES ──────────────────────────────────────────────────────
  'Retail / Distribution': `Example: "I'm a retail director with 11 years managing store networks. I oversaw 25 stores for a retail chain with €80M combined turnover and a team of 300 employees. I implemented omnichannel strategies that grew online sales by 150%. Seeking a regional director or VP Retail role."`,

  'Sales / Business Development': `Example: "I'm a B2B sales director with 9 years in SaaS and enterprise software. I built and led a team of 15 sales reps, growing ARR from €2M to €12M in 3 years at a tech company. I specialize in complex sales cycles. Seeking a VP Sales or Chief Revenue Officer role."`,

  'Import / Export': `Example: "I'm an international trade specialist with 8 years managing import/export operations. I worked in Dubai and Paris for a multinational, overseeing customs compliance for 10,000+ SKUs across 30 countries and negotiating €15M supplier contracts annually. Seeking a head of international trade role."`,

  'Purchasing / Supply Chain': `Example: "I'm a procurement director with 10 years in strategic sourcing and supplier management. I managed €100M in annual purchasing at a manufacturing company, reducing costs by 12% through supplier rationalization. Seeking a CPO or global procurement director role."`,
};

export default DOMAIN_PLACEHOLDERS;
