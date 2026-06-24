import os
from server import _test_as400_connection

res = _test_as400_connection("192.168.50.12", "KONFIN1", "KONFIN1")
print("Connection test result:", res)
