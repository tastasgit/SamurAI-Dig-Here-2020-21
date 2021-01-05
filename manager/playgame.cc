#include <iostream>
#include <fstream>
#include <sstream>
#include <iomanip>
#include <string>
#include <unistd.h>
#include <stdio.h>
#include <signal.h>
#include <chrono>
#include <future>
#include <thread>
#include <sys/types.h>
#include <signal.h>
#include <sys/wait.h>
#include "playgame.hh"

using namespace chrono;

pid_t playerIds[4];
FILE *toPlayers[4];
FILE *fromPlayers[4];

bool stepSummary = false;

static const int dx[] = { 0, 0,-1,-1,-1, 0, 1, 1, 1 };
static const int dy[] = { 0, 1, 1, 0,-1,-1,-1, 0, 1 };

static void killPlayerProcess(int p) {
  int status;
  kill(playerIds[p], SIGKILL);
  // fclose(toPlayers[p]);
  // fclose(fromPlayers[p]);
  waitpid(playerIds[p], &status, 0);
  playerIds[p] = 0;
}

static void sendGameInfo
(FILE *out, int id, int step,
 const Configuration &l,
 const int plans[], const int actions[], const int scores[],
 int timeLeft) {
  fprintf(out, "%d\n%d\n%d\n%d\n", id, l.size, step, l.steps);
  fprintf(out, "%d", (int)l.holes.size());
  for (auto h: l.holes) fprintf(out, " %d %d", h.x, h.y);
  fprintf(out, "\n");
  fprintf(out, "%d", (int)l.known.size());
  for (auto g: l.known) fprintf(out, " %d %d %d", g.x, g.y, g.amount);
  fprintf(out, "\n");
  int x = l.agents[id].x;
  int y = l.agents[id].y;
  vector <Gold> sensed;
  if (id >= 2) {
    for (int k = 0; k != 8; k++) {
      int nx = x+dx[k+1];
      int ny = y+dy[k+1];
      auto found =
	find_if(l.hidden.begin(), l.hidden.end(),
		[nx, ny](auto &g) { return g.x == nx && g.y == ny; });
      if (found != l.hidden.end())
	sensed.push_back(*found);
    }
  }
  fprintf(out, "%d", (int)sensed.size());
  for (auto s: sensed) {
    fprintf(out, " %d %d %d", s.x, s.y, s.amount);
  }
  fprintf(out, "\n");
  for (int p = 0; p != 4; p++) {
    if (p != 0) fprintf(out, " ");
    fprintf(out, "%d %d", l.agents[p].x, l.agents[p].y);
  }
  fprintf(out, "\n");
  for (int p = 0; p != 4; p++) {
    if (p != 0) fprintf(out, " ");
    fprintf(out, "%d", plans[p]);
  }
  fprintf(out, "\n");
  for (int p = 0; p != 4; p++) {
    if (p != 0) fprintf(out, " ");
    fprintf(out, "%d", actions[p]);
  }
  fprintf(out, "\n");
  fprintf(out, "%d %d\n", scores[0], scores[1]);
  int remaining = 0;
  for (auto &g: l.known) remaining += g.amount;
  for (auto &g: l.hidden) remaining += g.amount;
  fprintf(out, "%d\n", remaining);
  fprintf(out, "%d\n", timeLeft); // think time left
}

vector <StepLog> playGame
(const Configuration &initialConf,
 char *scripts[], char *dumpPath, int numScripts) {
  const Configuration *config = &initialConf;
  int coordWidth = config->size > 10 ? 2 : 1;
  int totalGolds = 0;
  for (auto g: initialConf.known) totalGolds += g.amount;
  for (auto g: initialConf.hidden) totalGolds += g.amount;
  FILE *dump[4];
  if (dumpPath != nullptr) {
    for (int p = 0; p != 4; p++) {
      const char *digits[] = { "0", "1", "2", "3" };
      string path(dumpPath);
      path.append(digits[p]);
      dump[p] = fopen(path.c_str(), "w");
      if (dump[p] == nullptr) {
	perror("Failed to open dump file: ");
	exit(1);
      }
    }
  }
  for (int p = 0; p != 4; p++) {
    int pipeOut[2];
    int pipeIn[2];
    if (pipe(pipeOut) < 0) {
      perror("Failed to open a pipe output to a player");
      exit(1);
    }
    if (pipe(pipeIn) < 0) {
      perror("Failed to open a pipe input from a player");
      exit(1);
    }
    pid_t pid = fork();
    if (pid < 0) {
      perror("Failed to fork a player process");
      exit(1);
    } else if (pid == 0) {
      close(pipeOut[1]); dup2(pipeOut[0], 0);
      close(pipeIn[0]); dup2(pipeIn[1], 1);
      const char *scrpt = numScripts == 2 ? scripts[p%2] : scripts[p];
      execl("/bin/sh", "sh", "-c", scrpt, (char *)NULL);
      perror("Failed to exec a player");
      exit(1);
    }
    playerIds[p] = pid;
    close(pipeOut[0]); toPlayers[p] = fdopen(pipeOut[1], "w");
    close(pipeIn[1]); fromPlayers[p] = fdopen(pipeIn[0], "r");
    kill(playerIds[p], SIGSTOP);
  }
  vector <StepLog> stepLogs;
  int scores[] = { 0, 0 };
  int plans[] = { -1, -1, -1, -1 };
  int newPlans[4];
  int actions[] = { -1, -1, -1, -1 };
  int timeLeft[4];
  fill(timeLeft, timeLeft+4, initialConf.thinkTime);
  for (int step = 0; step < config->steps; step++) {
    if (scores[0] + scores[1] == totalGolds) break;
    if (stepSummary) {
      cerr << "Step: " << step+1 << endl;
      if (config->known.size() != 0) {
	cerr << "Golds known:";
	for (auto g: config->known) {
	  cerr << " " << g.amount << "@(" << setw(coordWidth) << g.x << ","
	       << setw(coordWidth) << g.y << ")";
	}
	cerr << endl;
      }
    }
    for (int p = 0; p != 4; p++) {
      if (dumpPath != nullptr) {
	sendGameInfo(dump[p], p, step, *config,
		     plans, actions, scores, timeLeft[p]);
	fflush(dump[p]);
      }
      if (timeLeft[p] == 0) {
	newPlans[p] = -1;
	continue;
      }
      sendGameInfo(toPlayers[p], p, step, *config,
		   plans, actions, scores, timeLeft[p]);
      if (fflush(toPlayers[p]) != 0) {
	cerr << "Agent " << p << " error in flushing pipe" << endl;
	killPlayerProcess(p);
	if (dumpPath != nullptr) fclose(dump[p]);
	timeLeft[p] = 0;
	newPlans[p] = -1;
	continue;
      }
      bool done = false;
      kill(playerIds[p], SIGCONT);
      steady_clock::time_point sentAt = steady_clock::now();
      steady_clock::time_point receivedAt;
      thread receiver
	([](FILE *in, int &plan, bool &done,
	    steady_clock::time_point &receivedAt) {
	  fscanf(in, "%d", &plan);
	  receivedAt = steady_clock::now();
	  done = true;
	},
	 ref(fromPlayers[p]), ref(newPlans[p]), ref(done), ref(receivedAt));
      const int checkInterval = 10;
      while (!done) {
	usleep(1000*checkInterval);
	steady_clock::time_point current = steady_clock::now();
	int used = duration_cast<milliseconds>(current - sentAt).count();
	if (used > timeLeft[p]) break;
      }
      if (done) {
	receiver.join();
	kill(playerIds[p], SIGSTOP);
	steady_clock::time_point current = steady_clock::now();
	int used = duration_cast<milliseconds>(current - sentAt).count();
	timeLeft[p] = max(0, timeLeft[p] - used);
      } else {
	cerr << "Agent " << p << " timed out" << endl;
	receiver.detach();
	killPlayerProcess(p);
	if (dumpPath != nullptr) fclose(dump[p]);
	timeLeft[p] = 0;
	newPlans[p] = -1;
      }
    }
    copy(newPlans, newPlans+4, plans);
    Configuration *next =
      new Configuration(*config, plans, actions, scores);
    stepLogs.emplace_back(step, plans, actions, next->agents, timeLeft, scores);
    if (stepSummary) {
      for (int p = 0; p != 4; p++) {
	cerr << "Agent"
	     << (config->agents[p].energized ? '*' : ' ')
	     << p
	     << "@(" << setw(coordWidth) << config->agents[p].x << ","
	     << setw(coordWidth) << config->agents[p].y << ") ";
	int targetX = config->agents[p].x + dx[plans[p]%8 + 1];
	int targetY = config->agents[p].y + dy[plans[p]%8 + 1];
	bool failure = (plans[p] != actions[p]);
	cerr << (plans[p] < 0 ? "stay" :
		 plans[p] < 8 ? "move" :
		 plans[p] < 16 ? "dig " : "plug")
	     << " (" << setw(coordWidth) << targetX
	     << "," << setw(coordWidth) << targetY << ")"
	     << (failure ? "X" : " ")
	     << " " << timeLeft[p] << " msec left"
	     << (failure ? "; " + next->agents[p].reason : "")
	     << endl;
      }
      cerr << "Scores are " << scores[0] << ":" << scores[1] << endl;
    }
    config = next;
  }
  for (int p = 0; p != 4; p++) {
    if (playerIds[p] != 0) {
      killPlayerProcess(p);
      if (dumpPath != nullptr) fclose(dump[p]);
    }
  }
  return stepLogs;
}
