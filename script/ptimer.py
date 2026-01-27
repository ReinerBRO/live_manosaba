import time

class Timer:
    def __init__(self):
        self.start_time = time.time()

    def checkpoint(self, meg: str):
        end_time = time.time()
        print(f"\033[32m{meg} took {(end_time - self.start_time):.2f} seconds.\033[0m")
        self.start_time = end_time
