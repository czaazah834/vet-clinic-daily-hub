export const TODAY = new Date().toISOString().slice(0, 10);

/* Date math helper */
function addDays(dateStr, days) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function addMonths(dateStr, months) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function computeAgeDetails(birthDate) {
  if (!birthDate) return { days: 0, weeks: 0, months: 0, years: 0, formatted: "" };
  const b = new Date(birthDate + "T00:00:00");
  const now = new Date(TODAY + "T00:00:00");
  const diffTime = Math.max(0, now - b);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  
  let months = (now.getFullYear() - b.getFullYear()) * 12 + now.getMonth() - b.getMonth();
  if (now.getDate() < b.getDate()) months--;
  months = Math.max(0, months);
  const years = Math.floor(months / 12);

  let formatted = "";
  if (diffWeeks < 1) formatted = `${diffDays} day${diffDays === 1 ? "" : "s"} old`;
  else if (diffWeeks < 8) formatted = `${diffWeeks} week${diffWeeks === 1 ? "" : "s"} old`;
  else if (months < 12) formatted = `${months} month${months === 1 ? "" : "s"} old (${diffWeeks} wks)`;
  else formatted = `${years} yr${years > 1 ? "s" : ""}${months % 12 ? ` ${months % 12} mo` : ""}`;

  return { days: diffDays, weeks: diffWeeks, months, years, formatted };
}

/* Master preventive care timeline definitions */
export function getPreventiveSchedule(birthDate, species = "Dog", completedVaccs = []) {
  if (!birthDate) return [];

  const age = computeAgeDetails(birthDate);

  if (species === "Dog") {
    const rawItems = [
      {
        id: "dog-2w",
        ageLabel: "2 Weeks Old",
        daysOffset: 14,
        care: "Deworming",
        target: "Intestinal Parasites (Roundworms)",
        protocol: "Single oral dose",
        category: "deworm",
        isCore: false
      },
      {
        id: "dog-4w",
        ageLabel: "4 Weeks Old",
        daysOffset: 28,
        care: "Deworming",
        target: "Intestinal Parasites",
        protocol: "Single oral dose",
        category: "deworm",
        isCore: false
      },
      {
        id: "dog-6w",
        ageLabel: "6 Weeks Old",
        daysOffset: 42,
        care: "Core Vaccine & Deworming",
        target: "5-in-1 / DHPP (Dose 1) + Worms",
        protocol: "Start of immunization cycle",
        category: "vaccine",
        vaccineName: "DHPP 5-in-1 Dose 1",
        isCore: true
      },
      {
        id: "dog-8w",
        ageLabel: "8 Weeks Old",
        daysOffset: 56,
        care: "Deworming & Tick/Flea",
        target: "Parasites + Start Flea/Tick preventative",
        protocol: "Check minimum product weight limits",
        category: "parasite",
        isCore: false
      },
      {
        id: "dog-10w",
        ageLabel: "10 Weeks Old",
        daysOffset: 70,
        care: "Core Vaccine & Deworming",
        target: "5-in-1 / DHPP (Dose 2) + Worms",
        protocol: "Regular booster spacing",
        category: "vaccine",
        vaccineName: "DHPP 5-in-1 Dose 2",
        isCore: true
      },
      {
        id: "dog-12w",
        ageLabel: "12 Weeks Old",
        daysOffset: 84,
        care: "Deworming & Tick/Flea",
        target: "Routine preventative treatment",
        protocol: "Shift to standard monthly tracking",
        category: "parasite",
        isCore: false
      },
      {
        id: "dog-14-16w",
        ageLabel: "14 - 16 Weeks Old",
        daysOffset: 105,
        care: "Core Vaccine & Rabies",
        target: "5-in-1 (Dose 3) + First Rabies Shot",
        protocol: "Final puppy shots; mandatory by law",
        category: "vaccine",
        vaccineName: "DHPP Dose 3 + Rabies",
        isCore: true
      },
      {
        id: "dog-5m",
        ageLabel: "5 Months Old",
        daysOffset: 150,
        care: "Monthly Maintenance",
        target: "Deworming + Tick & Flea Prevention",
        protocol: "Administer exactly every 30 days",
        category: "parasite",
        isCore: false
      },
      {
        id: "dog-6m",
        ageLabel: "6 Months Old",
        daysOffset: 180,
        care: "Monthly Maintenance & Spay/Neuter Consult",
        target: "Deworming + Tick & Flea + Health Check",
        protocol: "Recommended evaluation for spaying/neutering",
        category: "exam",
        isCore: false
      },
      {
        id: "dog-1y",
        ageLabel: "1 Year Old",
        daysOffset: 365,
        care: "1-Year Adult Boosters",
        target: "DHPP 5-in-1 Booster + Annual Rabies Booster",
        protocol: "Exactly 1 year after final puppy shots",
        category: "vaccine",
        vaccineName: "Annual DHPP & Rabies Booster",
        isCore: true
      },
      {
        id: "dog-adult-deworm",
        ageLabel: "Adult Maintenance",
        daysOffset: 365 + 90,
        care: "Adult Deworming (Every 3 Months)",
        target: "Broad-spectrum deworming tablet 4 times a year",
        protocol: "Protects against parasites from floor, grass & soil",
        category: "deworm",
        isCore: false,
        isRecurring: true
      },
      {
        id: "dog-adult-parasite",
        ageLabel: "Adult Maintenance",
        daysOffset: 365 + 30,
        care: "Tick & Flea Prevention (Monthly)",
        target: "Monthly chewable/topical (NexGard/Simparica) or 90-day (Bravecto)",
        protocol: "Administer every 30 days (or 90 days for extended brands)",
        category: "parasite",
        isCore: false,
        isRecurring: true
      }
    ];

    return rawItems.map(item => {
      const targetDate = addDays(birthDate, item.daysOffset);
      const isPast = targetDate < TODAY;
      const isToday = targetDate === TODAY;
      const isDueSoon = !isPast && targetDate <= addDays(TODAY, 14);

      // Check if matching record exists in completedVaccs
      const isDone = completedVaccs.some(v =>
        v.done && (
          (item.vaccineName && v.vaccine?.toLowerCase().includes(item.vaccineName.split(" ")[0].toLowerCase())) ||
          (item.care && v.vaccine?.toLowerCase().includes(item.care.toLowerCase()))
        )
      );

      let status = "Upcoming";
      if (isDone) status = "Completed";
      else if (isPast) status = "Overdue";
      else if (isToday || isDueSoon) status = "Due Soon";

      return {
        ...item,
        targetDate,
        status,
        isDone
      };
    });
  }

  // Feline schedule
  if (species === "Cat") {
    const rawItems = [
      {
        id: "cat-4w",
        ageLabel: "4 Weeks Old",
        daysOffset: 28,
        care: "Kitten Deworming",
        target: "Intestinal Parasites",
        protocol: "Oral preventative dose",
        category: "deworm"
      },
      {
        id: "cat-8w",
        ageLabel: "8 Weeks Old",
        daysOffset: 56,
        care: "Core Vaccine & Deworming",
        target: "Feline 4-in-1 (FVRCP Dose 1) + Deworming",
        protocol: "Start of kitten core immunization",
        category: "vaccine",
        vaccineName: "FVRCP 4-in-1 Dose 1",
        isCore: true
      },
      {
        id: "cat-12w",
        ageLabel: "12 Weeks Old",
        daysOffset: 84,
        care: "Core Vaccine Booster & Flea/Tick",
        target: "Feline 4-in-1 (FVRCP Dose 2) + Parasite Prevention",
        protocol: "Regular booster spacing",
        category: "vaccine",
        vaccineName: "FVRCP 4-in-1 Dose 2",
        isCore: true
      },
      {
        id: "cat-16w",
        ageLabel: "16 Weeks Old",
        daysOffset: 112,
        care: "Core Vaccine & Rabies",
        target: "FVRCP Dose 3 + First Rabies Shot",
        protocol: "Final kitten core protection",
        category: "vaccine",
        vaccineName: "FVRCP Dose 3 + Rabies",
        isCore: true
      },
      {
        id: "cat-1y",
        ageLabel: "1 Year Old",
        daysOffset: 365,
        care: "1-Year Adult Boosters",
        target: "FVRCP Booster + Annual Rabies Booster",
        protocol: "1 year after final kitten series",
        category: "vaccine",
        vaccineName: "Annual FVRCP & Rabies Booster",
        isCore: true
      },
      {
        id: "cat-adult-parasite",
        ageLabel: "Adult Maintenance",
        daysOffset: 365 + 30,
        care: "Tick, Flea & Ear Mite Prevention",
        target: "Monthly topical preventative (Revolution / Advantage Multi)",
        protocol: "Every 30 days",
        category: "parasite",
        isRecurring: true
      }
    ];

    return rawItems.map(item => {
      const targetDate = addDays(birthDate, item.daysOffset);
      const isPast = targetDate < TODAY;
      const isToday = targetDate === TODAY;
      const isDueSoon = !isPast && targetDate <= addDays(TODAY, 14);

      const isDone = completedVaccs.some(v =>
        v.done && item.vaccineName && v.vaccine?.toLowerCase().includes(item.vaccineName.split(" ")[0].toLowerCase())
      );

      let status = "Upcoming";
      if (isDone) status = "Completed";
      else if (isPast) status = "Overdue";
      else if (isToday || isDueSoon) status = "Due Soon";

      return {
        ...item,
        targetDate,
        status,
        isDone
      };
    });
  }

  // Rabbit & other species
  return [
    {
      id: "other-check",
      ageLabel: "Every 6 - 12 Months",
      daysOffset: 180,
      targetDate: addDays(birthDate, 180),
      care: "Comprehensive Wellness Exam",
      target: "Dental, GI Tract & Weight Assessment",
      protocol: "Recommended annual veterinary health checkup",
      status: addDays(birthDate, 180) < TODAY ? "Overdue" : "Upcoming",
      isCore: true
    }
  ];
}

/* Helper to get the single most relevant next milestone */
export function getNextMilestone(birthDate, species = "Dog", completedVaccs = []) {
  const schedule = getPreventiveSchedule(birthDate, species, completedVaccs);
  if (!schedule.length) return null;

  // Find overdue first, then due soon, then first upcoming
  const overdue = schedule.find(s => s.status === "Overdue" && !s.isDone);
  if (overdue) return overdue;

  const dueSoon = schedule.find(s => s.status === "Due Soon" && !s.isDone);
  if (dueSoon) return dueSoon;

  const upcoming = schedule.find(s => s.status === "Upcoming" && !s.isDone);
  return upcoming || schedule[schedule.length - 1];
}
