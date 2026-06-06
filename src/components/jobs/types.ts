export interface Job {
  id:                  string;
  title:               string;
  company:             string;
  location:            string;
  country?:            string;
  salary?:             string;
  jobType?:            string;
  datePosted?:         string;
  description:         string;
  url?:                string;
  logo?:               string;
  // Extended fields — populated when available from the engine
  experience?:         string;    // "3 à 5 ans", "2+ years", "Entry level"
  education?:          string;    // "Bac+3", "Bachelor's degree"
  skills?:             string[];  // ["JavaScript", "React", …]
  remoteType?:         string;    // "Remote", "Hybrid", "On-site"
  companyDescription?: string;    // About the company
  category?:           string;    // Adzuna category label / FT romeLibelle
}

export interface SearchFilters {
  datePosted: '' | '1' | '3' | '7' | '30';
  jobType: '' | 'fulltime' | 'parttime' | 'contract' | 'remote';
  experience: '' | 'entry' | 'mid' | 'senior';
}
