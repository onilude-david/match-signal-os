import ExcelJS from "exceljs";
import { google } from "googleapis";

export const getSheetsClient = async () => {
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  await auth.authorize();
  return google.sheets({ version: "v4", auth });
};

export const safeJson = (value) => JSON.stringify(value ?? null);

export const stateToRows = ({ fixtures = [], ratings = [], accuracy = [], aiContent = {} }) => ({
  Fixtures: [
    ["match_id", "date", "time", "team_a", "team_b", "stage", "venue", "status", "content_status", "home_odds", "draw_odds", "away_odds"],
    ...fixtures.map((fixture) => [
      fixture.id,
      fixture.date,
      fixture.time,
      fixture.teamA,
      fixture.teamB,
      fixture.stage,
      fixture.venue,
      fixture.status,
      fixture.contentStatus,
      fixture.homeOdds,
      fixture.drawOdds,
      fixture.awayOdds,
    ]),
  ],
  "Team Ratings": [
    ["team", "form_score", "attack", "defense", "midfield", "squad_depth", "coach", "injury_impact", "motivation"],
    ...ratings.map((rating) => [
      rating.team,
      rating.form,
      rating.attack,
      rating.defense,
      rating.midfield,
      rating.depth,
      rating.coach,
      rating.injuryImpact,
      rating.motivation,
    ]),
  ],
  Accuracy: [
    ["match_id", "final_score", "actual_winner", "model_read", "lesson"],
    ...accuracy.map((record) => [record.matchId, record.finalScore, record.actualWinner, record.modelRead, record.lesson]),
  ],
  "AI Content": [
    ["match_id", "telegram_post", "x_post", "thread", "shorts_script", "video_title", "report_section", "market_context", "safety_notes"],
    ...Object.entries(aiContent).map(([matchId, content]) => [
      matchId,
      content.telegram,
      content.xPost,
      content.thread,
      content.shortsScript,
      content.videoTitle,
      content.reportSection,
      content.marketContext ?? content.bettingAngle,
      content.safetyNotes.join("; "),
    ]),
  ],
});

export const addWorksheet = (workbook, name, rows) => {
  const sheet = workbook.addWorksheet(name);
  sheet.addRows(rows);
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFF7F0E2" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17211E" } };
  header.alignment = { vertical: "middle" };
  sheet.columns.forEach((column) => {
    let maxLength = 10;
    column.eachCell({ includeEmpty: true }, (cell) => {
      maxLength = Math.max(maxLength, String(cell.value ?? "").length);
    });
    column.width = Math.min(Math.max(maxLength + 2, 12), 46);
  });
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: rows[0]?.length ?? 1 },
  };
  return sheet;
};

export const buildWorkbook = async (state) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "The Match Signal OS";
  workbook.created = new Date();
  workbook.modified = new Date();

  const rowGroups = stateToRows(state);
  Object.entries(rowGroups).forEach(([name, rows]) => addWorksheet(workbook, name, rows));

  const fixtures = state.fixtures ?? [];
  const groupRows = [["group", "team", "played", "wins", "draws", "losses", "goals_for", "goals_against", "goal_difference", "points"]];
  const groupMap = new Map();
  for (const fixture of fixtures) {
    const group = fixture.stage?.split("/")?.[1]?.trim() ?? "Knockout";
    if (!group.startsWith("GROUP_")) continue;
    for (const team of [fixture.teamA, fixture.teamB]) {
      if (!team || team === "TBD") continue;
      const key = `${group}:${team}`;
      if (!groupMap.has(key)) groupMap.set(key, [group.replace("GROUP_", "Group "), team, 0, 0, 0, 0, 0, 0, 0, 0]);
    }
  }
  groupRows.push(...Array.from(groupMap.values()).sort((a, b) => `${a[0]}:${a[1]}`.localeCompare(`${b[0]}:${b[1]}`)));
  addWorksheet(workbook, "Group Tables", groupRows);

  const dashboardRows = [
    ["metric", "value"],
    ["fixtures", fixtures.length],
    ["ratings", state.ratings?.length ?? 0],
    ["content_outputs", Object.keys(state.aiContent ?? {}).length],
    ["accuracy_records", state.accuracy?.length ?? 0],
    ["generated_at", new Date().toISOString()],
  ];
  addWorksheet(workbook, "Dashboard", dashboardRows);

  return workbook;
};
