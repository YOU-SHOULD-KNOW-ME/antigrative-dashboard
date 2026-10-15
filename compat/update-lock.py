"""Cross-process lifecycle lock. OS releases it even after process termination."""
from contextlib import contextmanager
import os
from pathlib import Path
import stat


def linked(path):
    try:
        info = path.lstat()
    except FileNotFoundError:
        return False
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, 'st_file_attributes', 0) & 0x400)


@contextmanager
def lifecycle_lock(target):
    path = Path(target).parent / '.antigravity-pulse-update.lock'
    path.parent.mkdir(parents=True, exist_ok=True)
    if linked(path):
        raise ValueError('Linked lifecycle lock is unsupported')
    handle = os.open(path, os.O_CREAT | os.O_RDWR | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    acquired = False
    try:
        if os.fstat(handle).st_size == 0:
            os.write(handle, b'0')
        os.lseek(handle, 0, os.SEEK_SET)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle, msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise FileExistsError('Another lifecycle operation is running') from error
        acquired = True
        yield
    finally:
        if acquired:
            os.lseek(handle, 0, os.SEEK_SET)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle, msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_UN)
        os.close(handle)
    # Never unlink: deleting/recreating a locked inode admits a second writer.
